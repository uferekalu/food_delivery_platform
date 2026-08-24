import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { Rider, RiderDocument } from './schemas/rider.schema';
import { ApplyRiderDto } from './dto/apply-rider.dto';

@Injectable()
export class RidersService {
  constructor(
    @InjectModel(Rider.name) private readonly riderModel: Model<RiderDocument>,
    private readonly usersService: UsersService,
  ) {}

  /** A customer applying to become a rider — creates the Rider profile (unverified until an
   * admin flips it, mirroring Restaurant.isApproved) and promotes their account role
   * immediately, the same "role granted up front, trust gated separately" split already used
   * for restaurant_owner. The caller's current access token still has the old role baked in
   * until their next refresh — see backend/CLAUDE.md's ownership/role-change notes.
   *
   * Restricted to plain `customer` accounts, not just "not already rider/admin": a
   * `restaurant_owner` who applied would have their role silently overwritten to `rider`,
   * which would lock them out of `@Roles('restaurant_owner', 'admin')`-gated endpoints for a
   * restaurant they still legally own (the role guard checks the *current* role, not DB
   * ownership) — a real self-inflicted lockout, not just a theoretical one. */
  async apply(
    requester: AccessTokenPayload,
    dto: ApplyRiderDto,
  ): Promise<RiderDocument> {
    if (requester.role !== 'customer') {
      throw new BadRequestException(
        requester.role === 'rider'
          ? 'You are already a rider'
          : requester.role === 'restaurant_owner'
            ? 'Restaurant owner accounts cannot also become riders'
            : 'Admins do not need a rider profile',
      );
    }
    const existing = await this.riderModel
      .findOne({ userId: requester.sub })
      .exec();
    if (existing) throw new BadRequestException('You already applied');

    const rider = await this.riderModel.create({
      userId: requester.sub,
      vehicleType: dto.vehicleType,
    });
    await this.usersService.updateRole(requester.sub, 'rider');
    return rider;
  }

  async findMine(userId: string): Promise<RiderDocument> {
    const rider = await this.riderModel.findOne({ userId }).exec();
    if (!rider) throw new NotFoundException('Rider profile not found');
    return rider;
  }

  async toggleOnline(userId: string): Promise<RiderDocument> {
    const rider = await this.findMine(userId);
    rider.isOnline = !rider.isOnline;
    return rider.save();
  }

  /** Admin-only listing, so there's something to work from before verifying a rider — mirrors
   * how restaurant approval has no dedicated admin UI yet either (docs/ROADMAP.md FDP-20). */
  findAll(): Promise<RiderDocument[]> {
    return this.riderModel.find().sort({ createdAt: -1 }).exec();
  }

  /** Feeds the admin analytics overview (docs/ROADMAP.md FDP-20). */
  async countByVerification(): Promise<{ verified: number; pending: number }> {
    const [verified, pending] = await Promise.all([
      this.riderModel.countDocuments({ isVerified: true }).exec(),
      this.riderModel.countDocuments({ isVerified: false }).exec(),
    ]);
    return { verified, pending };
  }

  async verify(riderId: string): Promise<RiderDocument> {
    const rider = await this.riderModel.findById(riderId).exec();
    if (!rider) throw new NotFoundException('Rider not found');
    rider.isVerified = true;
    return rider.save();
  }

  /** Called by ReviewsService after a review is created/changed — recomputed from scratch each
   * time, same rationale as RestaurantsService.updateRatingStats (docs/ROADMAP.md FDP-18).
   * Keyed by `userId` (Order.riderId's own convention), not the Rider document's own `_id`. */
  async updateRatingStats(
    userId: string,
    rating: number,
    reviewCount: number,
  ): Promise<void> {
    await this.riderModel.updateOne({ userId }, { rating, reviewCount }).exec();
  }

  /** Throws unless the rider is verified — the gate on self-assigning to an order, not on
   * merely viewing the queue or toggling online (see RidersController). */
  async assertVerified(userId: string): Promise<RiderDocument> {
    const rider = await this.findMine(userId);
    if (!rider.isVerified) {
      throw new ForbiddenException(
        'Your rider account is not verified yet — you cannot accept orders until an admin verifies it',
      );
    }
    return rider;
  }
}
