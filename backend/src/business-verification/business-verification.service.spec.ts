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
            companyName: 'Burgundy Kitchen Ltd',
            status: 'active',
            address: '1 Main St, Lagos',
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
      registeredAddress: '1 Main St, Lagos',
      rawStatus: 'active',
    });
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
            companyName: 'A Completely Different Company Ltd',
            status: 'active',
            address: '1 Main St, Lagos',
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
