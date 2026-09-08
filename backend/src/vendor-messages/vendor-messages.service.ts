import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { PaginatedResult } from '../restaurants/restaurants.service';
import {
  VendorMessage,
  VendorMessageDocument,
} from './schemas/vendor-message.schema';
import {
  VendorConversation,
  VendorConversationDocument,
} from './schemas/vendor-conversation.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Most recent messages returned for a thread — this is a two-party conversation, not an
 * unbounded log; capping avoids ever loading an unreasonably long history into memory. */
const MESSAGE_HISTORY_LIMIT = 200;
const PREVIEW_LENGTH = 140;

export interface VendorConversationView {
  vendorId: string;
  vendorName: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastSenderRole: VendorConversation['lastSenderRole'];
  unreadByAdmin: number;
  unreadByVendor: number;
}

/**
 * Admin<->vendor messaging (docs/ROADMAP.md FDP-108) — real-time two-way conversation, distinct
 * from the support-tickets/chatbot pair (FDP-106), which are customer-facing and not threaded.
 * Both `sendFromVendor`/`sendFromAdmin` follow the exact dual fan-out `OrdersService` already
 * uses after a status transition: persist, push live via `RealtimeGateway`, then also call
 * `NotificationsService.notify()` so the recipient sees it in their bell/email/push even if
 * they're not currently looking at the thread.
 */
@Injectable()
export class VendorMessagesService {
  private readonly logger = new Logger(VendorMessagesService.name);

  constructor(
    @InjectModel(VendorMessage.name)
    private readonly messageModel: Model<VendorMessageDocument>,
    @InjectModel(VendorConversation.name)
    private readonly conversationModel: Model<VendorConversationDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async sendFromVendor(
    vendorId: string,
    body: string,
  ): Promise<VendorMessageDocument> {
    const message = await this.messageModel.create({
      vendorId,
      senderId: vendorId,
      senderRole: 'restaurant_owner',
      body,
    });
    await this.upsertConversation(vendorId, body, 'restaurant_owner', {
      incrementUnreadFor: 'admin',
    });
    this.realtimeGateway.emitVendorMessage(vendorId, message);
    await this.notifyAdmins(vendorId, body);
    return message;
  }

  async sendFromAdmin(
    adminId: string,
    vendorId: string,
    body: string,
  ): Promise<VendorMessageDocument> {
    const vendor = await this.usersService.findById(vendorId);
    if (!vendor || vendor.role !== 'restaurant_owner') {
      throw new NotFoundException('Vendor not found');
    }

    const message = await this.messageModel.create({
      vendorId,
      senderId: adminId,
      senderRole: 'admin',
      body,
    });
    await this.upsertConversation(vendorId, body, 'admin', {
      incrementUnreadFor: 'vendor',
    });
    this.realtimeGateway.emitVendorMessage(vendorId, message);
    await this.notifyVendor(vendorId, body);
    return message;
  }

  async getMessages(vendorId: string): Promise<VendorMessageDocument[]> {
    const messages = await this.messageModel
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .limit(MESSAGE_HISTORY_LIMIT)
      .exec();
    return messages.reverse();
  }

  async listConversationsForAdmin(query: {
    page: number;
    limit: number;
  }): Promise<PaginatedResult<VendorConversationView>> {
    const [conversations, total] = await Promise.all([
      this.conversationModel
        .find({})
        .sort({ lastMessageAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.conversationModel.countDocuments({}).exec(),
    ]);

    const vendorIds = [
      ...new Set(
        conversations
          .map((c) => c.vendorId)
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ];
    const vendors =
      vendorIds.length > 0 ? await this.usersService.findByIds(vendorIds) : [];
    const nameByVendor = new Map(
      vendors.map((v) => [v._id.toString(), v.name] as const),
    );

    return {
      items: conversations.map((c) => ({
        vendorId: c.vendorId,
        vendorName: nameByVendor.get(c.vendorId) ?? null,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        lastSenderRole: c.lastSenderRole,
        unreadByAdmin: c.unreadByAdmin,
        unreadByVendor: c.unreadByVendor,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async markReadByVendor(vendorId: string): Promise<void> {
    await this.conversationModel
      .updateOne({ vendorId }, { unreadByVendor: 0 })
      .exec();
  }

  async markReadByAdmin(vendorId: string): Promise<void> {
    await this.conversationModel
      .updateOne({ vendorId }, { unreadByAdmin: 0 })
      .exec();
  }

  private async upsertConversation(
    vendorId: string,
    lastBody: string,
    lastSenderRole: VendorConversation['lastSenderRole'],
    options: { incrementUnreadFor: 'admin' | 'vendor' },
  ): Promise<void> {
    const preview =
      lastBody.length > PREVIEW_LENGTH
        ? `${lastBody.slice(0, PREVIEW_LENGTH)}…`
        : lastBody;
    // `$inc` and `$setOnInsert` can never target the same field in one update — Mongo rejects
    // it as a path conflict. `$inc` on a field that doesn't exist yet (a fresh upsert) already
    // initializes it to the increment amount on its own, so only the *other* counter (the one
    // not being incremented this call) needs an explicit `$setOnInsert` default.
    const incrementField =
      options.incrementUnreadFor === 'admin'
        ? 'unreadByAdmin'
        : 'unreadByVendor';
    const otherField =
      options.incrementUnreadFor === 'admin'
        ? 'unreadByVendor'
        : 'unreadByAdmin';

    await this.conversationModel
      .updateOne(
        { vendorId },
        {
          $set: {
            lastMessageAt: new Date(),
            lastMessagePreview: preview,
            lastSenderRole,
          },
          $inc: { [incrementField]: 1 },
          $setOnInsert: {
            [otherField]: 0,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /** Same admin-listing-and-fan-out shape already established by
   * `SupportTicketsService.notifyAdmins`/`PayoutExecutionService.notifyAdmins` — non-fatal, a
   * notification failure never blocks the message that was already created. */
  private async notifyAdmins(vendorId: string, body: string): Promise<void> {
    try {
      const vendor = await this.usersService.findById(vendorId);
      const vendorName = vendor?.name ?? 'A vendor';
      const admins = await this.usersService.listAll({
        role: 'admin',
        page: 1,
        limit: 50,
      });
      await Promise.all(
        admins.items.map((admin) =>
          this.notificationsService.notify({
            userId: admin._id.toString(),
            type: 'new_vendor_message',
            title: `New message from ${vendorName}`,
            body: truncate(body, PREVIEW_LENGTH),
            metadata: { vendorId },
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        'Failed to notify admins about a new vendor message',
        error,
      );
    }
  }

  private async notifyVendor(vendorId: string, body: string): Promise<void> {
    try {
      await this.notificationsService.notify({
        userId: vendorId,
        type: 'new_admin_message',
        title: 'New message from support',
        body: truncate(body, PREVIEW_LENGTH),
        metadata: { vendorId },
      });
    } catch (error) {
      this.logger.error(
        'Failed to notify vendor about a new admin message',
        error,
      );
    }
  }
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
