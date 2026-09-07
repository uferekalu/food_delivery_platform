import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PaginatedResult } from '../restaurants/restaurants.service';
import {
  SupportTicket,
  SupportTicketDocument,
} from './schemas/support-ticket.schema';
import type { ChatIdentity } from './chat-identity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

/**
 * Support chat widget (docs/ROADMAP.md FDP-106) — the human-escalation half of the chatbot.
 * `ChatbotService` is this module's only real caller for `create`; the two admin routes
 * (`listAll`/`resolve`) exist purely so a human can actually work through what the bot couldn't
 * answer.
 */
@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);

  constructor(
    @InjectModel(SupportTicket.name)
    private readonly ticketModel: Model<SupportTicketDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    question: string,
    identity: ChatIdentity,
    matchedEntryId: string | null,
  ): Promise<SupportTicketDocument> {
    const ticket = await this.ticketModel.create({
      question,
      userId: identity.userId,
      sessionId: identity.sessionId,
      matchedEntryId,
      status: 'open',
    });
    await this.notifyAdmins(ticket);
    return ticket;
  }

  listAll(query: {
    page: number;
    limit: number;
    status?: SupportTicketDocument['status'];
  }): Promise<PaginatedResult<SupportTicketDocument>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;

    return Promise.all([
      this.ticketModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.ticketModel.countDocuments(filter).exec(),
    ]).then(([items, total]) => ({
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    }));
  }

  async resolve(
    id: string,
    adminUserId: string,
  ): Promise<SupportTicketDocument> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        id,
        { status: 'resolved', resolvedAt: new Date(), resolvedBy: adminUserId },
        { returnDocument: 'after' },
      )
      .exec();
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  /** Same admin-listing-and-fan-out shape already established by
   * `PayoutExecutionService.notifyAdmins`/`OrdersService.notifyAdminsOfRefundIssue` — non-fatal,
   * a notification failure never blocks the ticket that was already created. */
  private async notifyAdmins(ticket: SupportTicketDocument): Promise<void> {
    try {
      const admins = await this.usersService.listAll({
        role: 'admin',
        page: 1,
        limit: 50,
      });
      await Promise.all(
        admins.items.map((admin) =>
          this.notificationsService.notify({
            userId: admin._id.toString(),
            type: 'support_ticket_created',
            title: 'New support question needs a reply',
            body: `A visitor asked something the chat widget couldn't confidently answer: "${ticket.question}"`,
            metadata: { ticketId: ticket._id.toString() },
          }),
        ),
      );
    } catch (error) {
      this.logger.error('Failed to notify admins about a new support ticket', error);
    }
  }
}
