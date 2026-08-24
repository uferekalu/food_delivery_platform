import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SmsService } from './sms.service';
import type { PaginatedResult } from '../restaurants/restaurants.service';
import {
  Notification,
  NotificationChannel,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { ListNotificationsDto } from './dto/list-notifications.dto';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  /** Sent via `MailService` if provided — a failure here is logged and swallowed, never thrown,
   * since a notification email is a best-effort side channel, not something an order-status
   * transition should fail over. */
  email?: { subject: string; html: string };
  /** Sent via `SmsService` if provided *and* the recipient has a saved phone number — silently
   * skipped otherwise (no phone, or Termii unconfigured — see `SmsService`). */
  sms?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * The only write path onto the `Notification` collection (backend/CLAUDE.md's "one service
   * owns a model's writes" convention) — always creates one `inapp` row, and best-effort fans
   * out to email/SMS alongside it. Never throws on an email/SMS delivery failure; the caller
   * (e.g. `OrdersService`, right after a status transition) shouldn't have its own success/
   * failure hinge on a side channel.
   */
  async notify(input: NotifyInput): Promise<NotificationDocument> {
    const channels: NotificationChannel[] = ['inapp'];
    const needsUser = !!input.email || !!input.sms;
    const user = needsUser
      ? await this.usersService.findById(input.userId)
      : null;

    if (input.email && user) channels.push('email');
    if (input.sms && user?.phone) channels.push('sms');

    const notification = await this.notificationModel.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      isRead: false,
      channels,
      metadata: input.metadata ?? {},
    });

    this.realtimeGateway.emitNotification(input.userId, notification);

    if (input.email && user) {
      this.mailService
        .sendNotificationEmail(
          user.email,
          input.email.subject,
          input.email.html,
        )
        .catch((err: Error) =>
          this.logger.error(
            `Notification email to ${input.userId} failed: ${err.message}`,
          ),
        );
    }

    if (input.sms && user?.phone) {
      void this.smsService.send(user.phone, input.sms);
    }

    return notification;
  }

  findMine(
    userId: string,
    query: ListNotificationsDto,
  ): Promise<PaginatedResult<NotificationDocument>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = { userId };

    return Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
    ]).then(([items, total]) => ({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }));
  }

  unreadCount(userId: string): Promise<number> {
    return this.notificationModel
      .countDocuments({ userId, isRead: false })
      .exec();
  }

  async markRead(userId: string, id: string): Promise<NotificationDocument> {
    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: id, userId },
        { isRead: true },
        { returnDocument: 'after' },
      )
      .exec();
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationModel
      .updateMany({ userId, isRead: false }, { isRead: true })
      .exec();
  }
}
