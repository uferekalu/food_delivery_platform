import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BusinessVerificationService } from './business-verification.service';

describe('BusinessVerificationService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  async function buildService(config: Record<string, string>) {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessVerificationService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();
    return moduleRef.get(BusinessVerificationService);
  }

  it('is not configured, and resolves to `unknown` without calling fetch, when YOUVERIFY_API_KEY is unset', async () => {
    const service = await buildService({});
    global.fetch = jest.fn();

    expect(service.isConfigured).toBe(false);
    const result = await service.verifyBusinessRegistration(
      'RC1234567',
      'Burgundy Kitchen',
    );

    expect(result).toEqual({
      outcome: 'unknown',
      reason: 'Youverify not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves to `verified` when the provider confirms a matching registration', async () => {
    const service = await buildService({ YOUVERIFY_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            registrationNumber: 'RC1234567',
            name: 'Burgundy Kitchen Ltd',
            status: 'found',
            companyStatus: 'ACTIVE',
          },
        }),
    });

    const result = await service.verifyBusinessRegistration(
      'RC1234567',
      'Burgundy Kitchen',
    );

    expect(result).toEqual({
      outcome: 'verified',
      registeredName: 'Burgundy Kitchen Ltd',
      registeredAddress: null,
      rawStatus: 'ACTIVE',
    });
    // Confirmed against Youverify's real docs (docs/ROADMAP.md FDP-120), not a guess.
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.youverify.co/v2/api/verifications/ng/company/basic',
      expect.objectContaining({
        method: 'POST',
        headers: { token: 'key-123', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationNumber: 'RC1234567',
          isConsent: true,
        }),
      }),
    );
  });

  it('resolves to `mismatch` when the provider explicitly reports the number was not found (status !== "found")', async () => {
    const service = await buildService({ YOUVERIFY_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { status: 'not_found' },
        }),
    });

    const result = await service.verifyBusinessRegistration(
      'RC0000000',
      'Nonexistent Business',
    );

    expect(result.outcome).toBe('mismatch');
  });

  it('uses YOUVERIFY_BASE_URL when set, e.g. for a sandbox/staging key', async () => {
    const service = await buildService({
      YOUVERIFY_API_KEY: 'key-123',
      YOUVERIFY_BASE_URL: 'https://api.sandbox.youverify.co',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { status: 'found', name: 'X' },
        }),
    });

    await service.verifyBusinessRegistration('RC1234567', 'Burgundy Kitchen');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.sandbox.youverify.co/v2/api/verifications/ng/company/basic',
      expect.anything(),
    );
  });

  it('resolves to `mismatch` (not a throw) when the provider reports success: false / no data', async () => {
    const service = await buildService({ YOUVERIFY_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: false,
          message: 'Registration number not found',
        }),
    });

    const result = await service.verifyBusinessRegistration(
      'RC0000000',
      'Nonexistent Business',
    );

    expect(result).toEqual({
      outcome: 'mismatch',
      registeredName: null,
      registeredAddress: null,
      rawStatus: null,
      reason: 'Registration number not found',
    });
  });

  it('resolves to `mismatch` when the provider finds the number but the registered name does not match', async () => {
    const service = await buildService({ YOUVERIFY_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            name: 'A Completely Different Company Ltd',
            status: 'found',
            companyStatus: 'ACTIVE',
          },
        }),
    });

    const result = await service.verifyBusinessRegistration(
      'RC1234567',
      'Burgundy Kitchen',
    );

    expect(result.outcome).toBe('mismatch');
  });

  it('resolves to `unknown` (never `mismatch`) when the network call itself rejects', async () => {
    const service = await buildService({ YOUVERIFY_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const result = await service.verifyBusinessRegistration(
      'RC1234567',
      'Burgundy Kitchen',
    );

    expect(result.outcome).toBe('unknown');
  });

  it('resolves to `unknown` (never `mismatch`) on a non-OK HTTP status', async () => {
    const service = await buildService({ YOUVERIFY_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('internal error'),
    });

    const result = await service.verifyBusinessRegistration(
      'RC1234567',
      'Burgundy Kitchen',
    );

    expect(result.outcome).toBe('unknown');
  });
});
