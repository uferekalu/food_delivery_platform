import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Termii (https://termii.com) SMS gateway. No real Termii credentials exist for this project
 * (only the variable-naming convention is known, from a sibling project's `.env`) — mirrors the
 * `NEXT_PUBLIC_MAPBOX_TOKEN`-absent graceful-degradation pattern (`LiveDeliveryMap`,
 * docs/ROADMAP.md FDP-17): when `TERMII_API_KEY`/`TERMII_SENDER_ID` aren't configured, `send`
 * logs and returns instead of throwing, so the rest of the notification flow (in-app + email)
 * is never blocked by a missing SMS provider. Failed/unconfigured sends are deliberately
 * swallowed here (not surfaced to the caller) for the same reason — SMS is a best-effort side
 * channel, never something an order-status transition should fail over.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly senderId?: string;
  private readonly channel: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('TERMII_API_KEY');
    this.baseUrl =
      this.config.get<string>('TERMII_BASE_URL') ?? 'https://api.ng.termii.com';
    this.senderId = this.config.get<string>('TERMII_SENDER_ID');
    this.channel = this.config.get<string>('TERMII_CHANNEL') ?? 'generic';
  }

  get isConfigured(): boolean {
    return !!this.apiKey && !!this.senderId;
  }

  async send(to: string, message: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.log(`SMS not configured — skipped send to ${to}`);
      return false;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          to,
          from: this.senderId,
          sms: message,
          type: 'plain',
          channel: this.channel,
        }),
      });
      if (!res.ok) {
        this.logger.error(
          `Termii SMS send to ${to} failed with status ${res.status}: ${await res.text()}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Termii SMS send to ${to} threw: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
