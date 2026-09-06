import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as webpush from 'web-push';
import {
  PushSubscription,
  PushSubscriptionDocument,
} from './schemas/push-subscription.schema';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where `notificationclick` in the service worker should focus/open — defaults to the
   * in-app notifications list, since not every `NotificationsService.notify()` caller has a
   * more specific deep link to offer. */
  url?: string;
}

/**
 * Web push (docs/ROADMAP.md FDP-100) — delivers a real OS-level notification even with no tab
 * open, via the browser's Push API + a service worker (`frontend/public/sw.js`). No real VAPID
 * key pair exists for this project yet (generate one with `npx web-push generate-vapid-keys`);
 * mirrors `SmsService`'s graceful-degradation pattern exactly: unset keys means `isConfigured` is
 * false, `send()` logs and no-ops rather than throwing, so the rest of `NotificationsService
 * .notify()`'s fan-out (in-app/email/SMS) is never blocked by a missing push provider.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey?: string;
  private readonly privateKey?: string;
  private readonly subject?: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(PushSubscription.name)
    private readonly subscriptionModel: Model<PushSubscriptionDocument>,
  ) {
    this.publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    this.privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    this.subject = this.config.get<string>('VAPID_SUBJECT');
    if (this.isConfigured) {
      webpush.setVapidDetails(this.subject!, this.publicKey!, this.privateKey!);
    }
  }

  get isConfigured(): boolean {
    return !!this.publicKey && !!this.privateKey && !!this.subject;
  }

  /** `null` when unconfigured — the frontend's "enable push notifications" toggle stays hidden
   * in that case rather than offering a control that can never actually subscribe. */
  getPublicKey(): string | null {
    return this.publicKey ?? null;
  }

  /** Upserts on `endpoint`, not `userId` — see the schema's doc comment for why (one user can
   * have several browsers/devices subscribed at once). */
  async subscribe(
    userId: string,
    subscription: PushSubscriptionInput,
  ): Promise<void> {
    await this.subscriptionModel
      .updateOne(
        { endpoint: subscription.endpoint },
        { userId, endpoint: subscription.endpoint, keys: subscription.keys },
        // Mongoose doesn't run schema validators on updateOne by default — the DTO is the
        // primary gate, but this is a real belt-and-suspenders check against a future call site
        // that skips it.
        { upsert: true, runValidators: true },
      )
      .exec();
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionModel.deleteOne({ userId, endpoint }).exec();
  }

  /**
   * Best-effort, same posture as `SmsService.send`: never throws, so a push failure can't fail
   * whatever triggered the notification. Sends to every subscription the user has (every
   * browser/device), not just one. A 404/410 from the push service means the browser itself
   * unsubscribed or the endpoint expired — that subscription is deleted rather than retried
   * forever; any other error is logged and left alone (a transient outage shouldn't delete a
   * subscription that's still good).
   */
  async send(userId: string, payload: PushPayload): Promise<void> {
    if (!this.isConfigured) {
      this.logger.log(`Push not configured — skipped send to ${userId}`);
      return;
    }

    const subscriptions = await this.subscriptionModel.find({ userId }).exec();
    if (subscriptions.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/notifications',
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          // Keys rebuilt as a plain object, not passed as the live Mongoose subdocument — see
          // backend/CLAUDE.md's note on never handing a Mongoose subdocument to code (or an
          // assertion) expecting a plain object; `web-push` only needs the two string values.
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
              },
            },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptionModel
              .deleteOne({ _id: subscription._id })
              .exec();
            return;
          }
          this.logger.error(
            `Push send to ${userId} (${subscription.endpoint}) failed: ${(err as Error).message}`,
          );
        }
      }),
    );
  }
}
