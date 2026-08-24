import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  async function buildService(config: Record<string, string>) {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();
    return moduleRef.get(SmsService);
  }

  it('is not configured, and send() no-ops without throwing, when TERMII_API_KEY/SENDER_ID are unset', async () => {
    const service = await buildService({});
    global.fetch = jest.fn();

    expect(service.isConfigured).toBe(false);
    const sent = await service.send('+15551234567', 'hello');

    expect(sent).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts to Termii with the configured credentials when set', async () => {
    const service = await buildService({
      TERMII_API_KEY: 'key-123',
      TERMII_SENDER_ID: 'FoodApp',
      TERMII_BASE_URL: 'https://api.ng.termii.com',
      TERMII_CHANNEL: 'generic',
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    expect(service.isConfigured).toBe(true);
    const sent = await service.send('+15551234567', 'hello');

    expect(sent).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.ng.termii.com/api/sms/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          api_key: 'key-123',
          to: '+15551234567',
          from: 'FoodApp',
          sms: 'hello',
          type: 'plain',
          channel: 'generic',
        }),
      }),
    );
  });

  it('returns false (never throws) when Termii responds with a non-2xx status', async () => {
    const service = await buildService({
      TERMII_API_KEY: 'key-123',
      TERMII_SENDER_ID: 'FoodApp',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('bad request'),
    });

    await expect(service.send('+15551234567', 'hello')).resolves.toBe(false);
  });

  it('returns false (never throws) when the network call itself rejects', async () => {
    const service = await buildService({
      TERMII_API_KEY: 'key-123',
      TERMII_SENDER_ID: 'FoodApp',
    });
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(service.send('+15551234567', 'hello')).resolves.toBe(false);
  });
});
