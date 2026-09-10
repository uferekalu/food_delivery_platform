import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SmsService } from './sms.service';
import { PushService } from './push.service';
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
  /** Where a web push notification's click should focus/open (docs/ROADMAP.md FDP-100) —
   * defaults to `/notifications` in `PushService.send` when omitted. Unlike email/sms, push is
   * never opt-in per call: every `notify()` attempts it automatically using `title`/`body`,
   * silently skipped if the user has no saved subscription or `PushService` is unconfigured. */
  pushUrl?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    // forwardRef (docs/ROADMAP.md FDP-115) — see NotificationsModule's matching comment for the
    // full 3-edge cycle this completes breaking.
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly pushService: PushService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * The only write path onto the `Notification` collection (backend/CLAUDE.md's "one service
   * owns a model's writes" convention) — always creates one `inapp` row, and best-effort fans
   * out to email/SMS/push alongside it. Never throws on an email/SMS/push delivery failure; the
   * caller (e.g. `OrdersService`, right after a status transition) shouldn't have its own
   * success/failure hinge on a side channel.
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

    // Not added to `channels` (unlike email/sms) — whether a subscription actually exists is
    // only known inside PushService's own async lookup, and checking it synchronously here just
    // to populate a cosmetic list isn't worth an extra DB round trip on every single notify()
    // call. Attempted unconditionally, unlike email/sms which are per-call opt-ins.
    void this.pushService.send(input.userId, {
      title: input.title,
      body: input.body,
      url: input.pushUrl,
    });

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
