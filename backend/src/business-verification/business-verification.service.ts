import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BASE_URL = 'https://api.youverify.co';

// Best-effort shape, reconstructed from Youverify's public docs (CAC/company-advance-check
// endpoint) — NOT verified against a live account, since none exists for this project yet.
// Flag for the user to confirm the exact field names/auth header against Youverify's own
// dashboard docs before going live, same caveat this repo already carries for Paystack's
// refund-webhook payload shape (see payments/adapters/paystack.adapter.ts).
interface YouverifyCacRequest {
  registrationNumber: string;
  businessName?: string;
  countryCode?: string;
}

interface YouverifyCacResponseData {
  registrationNumber?: string;
  companyName?: string;
  status?: string;
  address?: string;
}

interface YouverifyCacResponse {
  success: boolean;
  statusCode?: number;
  message?: string;
  data?: YouverifyCacResponseData;
}

export type BusinessVerificationOutcome =
  | {
      outcome: 'verified';
      registeredName: string;
      registeredAddress: string | null;
      rawStatus: string;
    }
  | {
      // Provider responded, but the number wasn't found or the registered name didn't match —
      // a confirmed negative result, never a throw.
      outcome: 'mismatch';
      registeredName: string | null;
      registeredAddress: string | null;
      rawStatus: string | null;
      reason: string;
    }
  | {
      // Not configured, network/timeout, or an ambiguous/unparseable response — the caller must
      // never treat this as a rejection, only as "we couldn't check, fall back to manual review".
      outcome: 'unknown';
      reason: string;
    };

/**
 * Youverify (https://youverify.co) automated CAC/RC business-registration check (docs/ROADMAP.md
 * FDP-115). Deliberately optional, same graceful-degradation pattern as `SmsService`/Termii: no
 * real Youverify account exists for this project yet, so `isConfigured` is false and every check
 * resolves to `{ outcome: 'unknown' }`, which callers treat identically to "not configured" —
 * falling back to the existing manual admin approval queue, never blocking registration.
 */
@Injectable()
export class BusinessVerificationService {
  private readonly logger = new Logger(BusinessVerificationService.name);
  private readonly apiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('YOUVERIFY_API_KEY');
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async verifyBusinessRegistration(
    registrationNumber: string,
    businessName: string,
  ): Promise<BusinessVerificationOutcome> {
    if (!this.isConfigured) {
      return { outcome: 'unknown', reason: 'Youverify not configured' };
    }

    try {
      const res = await fetch(
        `${BASE_URL}/v2/api/verifications/global/company-advance-check`,
        {
          method: 'POST',
          headers: {
            token: this.apiKey!, // ASSUMPTION: Youverify's API auth header — unconfirmed, flag before going live.
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registrationNumber,
            businessName,
          } satisfies YouverifyCacRequest),
        },
      );
      if (!res.ok) {
        throw new Error(
          `Youverify responded with status ${res.status}: ${await res.text()}`,
        );
      }
      const body = (await res.json()) as YouverifyCacResponse;

      if (!body.success || !body.data) {
        return {
          outcome: 'mismatch',
          registeredName: null,
          registeredAddress: null,
          rawStatus: null,
          reason: body.message ?? 'Registration number not found',
        };
      }

      const registeredName = body.data.companyName ?? null;
      if (!this.namesLooselyMatch(businessName, registeredName ?? '')) {
        return {
          outcome: 'mismatch',
          registeredName,
          registeredAddress: body.data.address ?? null,
          rawStatus: body.data.status ?? null,
          reason: `Registered name "${registeredName}" does not match "${businessName}"`,
        };
      }

      return {
        outcome: 'verified',
        registeredName: registeredName ?? businessName,
        registeredAddress: body.data.address ?? null,
        rawStatus: body.data.status ?? 'unknown',
      };
    } catch (err) {
      // Network/timeout/malformed-response — an unknown outcome, never a rejection.
      this.logger.error(
        `Youverify check for ${registrationNumber} threw: ${(err as Error).message}`,
      );
      return { outcome: 'unknown', reason: (err as Error).message };
    }
  }

  /** Case/whitespace/punctuation-insensitive substring check — a real fuzzy-match library is out
   * of scope for this ticket, same "best-effort heuristic" spirit as the address-never-hard-
   * fails decision above. */
  private namesLooselyMatch(entered: string, registered: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = normalize(entered);
    const b = normalize(registered);
    return !!a && !!b && (a.includes(b) || b.includes(a));
  }
}
