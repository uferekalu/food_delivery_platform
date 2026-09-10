import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_BASE_URL = 'https://api.youverify.co';

// Confirmed against Youverify's real published docs (docs.youverify.co ->
// know-your-business-services-kyb/kyb-basic, docs/ROADMAP.md FDP-120) — this replaced an earlier
// guessed endpoint (`global/company-advance-check`) that turned out not to exist as documented.
// `POST /v2/api/verifications/ng/company/basic` — Nigeria-specific (the `ng` segment), the only
// KYB endpoint this integration targets today; a non-Nigerian registrationNumber simply won't be
// found, which the existing `mismatch`/`unknown` handling below already treats safely (falls
// back to the manual admin queue, same as any other unrecognized number). `registrationNumber`
// must carry its real CAC prefix (RC/BN/IT/LP/LLP, no space) — Youverify rejects a bare number.
// `isConsent: true` reflects the vendor's own registration submission (they're verifying their
// own business as part of onboarding), not a third party's.
interface YouverifyCacRequest {
  registrationNumber: string;
  isConsent: true;
}

// Live-confirmed request shape and auth header (`token`) against a real Youverify sandbox
// account — three different real, documented endpoints all returned a specific "403 Permission
// denied" business-logic error (not a generic 404/"missing token"), proving the request itself
// reaches Youverify correctly. The KYB product simply isn't enabled on that account/plan yet, so
// a genuine *successful* response body has never actually been seen — this response shape is
// still the one Youverify's own docs example, not independently verified end-to-end. Re-confirm
// once KYB is enabled and a real "found" response comes back, same caveat this repo already
// carries for Paystack's refund-webhook payload shape (see payments/adapters/paystack.adapter.ts).
interface YouverifyCacResponseData {
  registrationNumber?: string;
  name?: string;
  status?: string; // e.g. "found" — whether the number resolved to a real registration at all.
  companyStatus?: string; // e.g. "ACTIVE" — the registration's own status, distinct from `status`.
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
 * FDP-115). Deliberately optional, same graceful-degradation pattern as `SmsService`/Termii:
 * without `YOUVERIFY_API_KEY` set, `isConfigured` is false and every check resolves to
 * `{ outcome: 'unknown' }`, which callers treat identically to "not configured" — falling back
 * to the existing manual admin approval queue, never blocking registration.
 */
@Injectable()
export class BusinessVerificationService {
  private readonly logger = new Logger(BusinessVerificationService.name);
  private readonly apiKey?: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('YOUVERIFY_API_KEY');
    this.baseUrl =
      this.config.get<string>('YOUVERIFY_BASE_URL') ?? DEFAULT_BASE_URL;
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
        `${this.baseUrl}/v2/api/verifications/ng/company/basic`,
        {
          method: 'POST',
          headers: {
            token: this.apiKey!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registrationNumber,
            isConsent: true,
          } satisfies YouverifyCacRequest),
        },
      );
      if (!res.ok) {
        throw new Error(
          `Youverify responded with status ${res.status}: ${await res.text()}`,
        );
      }
      const body = (await res.json()) as YouverifyCacResponse;

      if (!body.success || !body.data || body.data.status !== 'found') {
        return {
          outcome: 'mismatch',
          registeredName: null,
          registeredAddress: null,
          rawStatus: null,
          reason: body.message ?? 'Registration number not found',
        };
      }

      const registeredName = body.data.name ?? null;
      if (!this.namesLooselyMatch(businessName, registeredName ?? '')) {
        return {
          outcome: 'mismatch',
          registeredName,
          registeredAddress: null,
          rawStatus: body.data.companyStatus ?? null,
          reason: `Registered name "${registeredName}" does not match "${businessName}"`,
        };
      }

      return {
        outcome: 'verified',
        registeredName: registeredName ?? businessName,
        registeredAddress: null,
        rawStatus: body.data.companyStatus ?? 'unknown',
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
