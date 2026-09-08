import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmChatService } from './llm-chat.service';

describe('LlmChatService (docs/ROADMAP.md FDP-110)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  async function buildService(config: Record<string, string>) {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LlmChatService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
      ],
    }).compile();
    return moduleRef.get(LlmChatService);
  }

  const KB = [
    {
      question: 'Delivery fee?',
      answer: 'Varies by zone.',
      category: 'delivery',
    },
  ];

  interface SentBody {
    model: string;
    tool_choice: { type: string; name: string };
    messages: { role: string; content: string }[];
  }

  function getSentBody(): SentBody {
    const mockFetch = global.fetch as jest.Mock<
      Promise<unknown>,
      [string, { body: string }]
    >;
    const [, init] = mockFetch.mock.calls[0];
    return JSON.parse(init.body) as SentBody;
  }

  it('is not configured, and answer() returns null without calling fetch, when ANTHROPIC_API_KEY is unset', async () => {
    const service = await buildService({});
    global.fetch = jest.fn();

    expect(service.isConfigured).toBe(false);
    const result = await service.answer('hi', KB);

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('posts to Anthropic with the configured key, model, and a forced submit_answer tool call', async () => {
    const service = await buildService({
      ANTHROPIC_API_KEY: 'key-123',
      ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            {
              type: 'tool_use',
              name: 'submit_answer',
              input: {
                answer: 'We deliver within your zone.',
                confident: true,
              },
            },
          ],
        }),
    });

    const result = await service.answer('where do you deliver?', KB);

    expect(result).toEqual({
      answer: 'We deliver within your zone.',
      confident: true,
    });
    const mockFetch = global.fetch as jest.Mock<
      Promise<unknown>,
      [
        string,
        { method: string; headers: Record<string, string>; body: string },
      ]
    >;
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('key-123');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = getSentBody();
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_answer' });
    expect(body.messages[0].content).toContain('where do you deliver?');
    expect(body.messages[0].content).toContain('Delivery fee?');
  });

  it('defaults to the built-in model when ANTHROPIC_MODEL is unset', async () => {
    const service = await buildService({ ANTHROPIC_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            {
              type: 'tool_use',
              name: 'submit_answer',
              input: { answer: 'hi', confident: true },
            },
          ],
        }),
    });

    await service.answer('hi', []);

    expect(getSentBody().model).toBe('claude-haiku-4-5-20251001');
  });

  it('returns null (never throws) when Anthropic responds with a non-2xx status', async () => {
    const service = await buildService({ ANTHROPIC_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('invalid api key'),
    });

    await expect(service.answer('hi', KB)).resolves.toBeNull();
  });

  it('returns null (never throws) when the network call itself rejects', async () => {
    const service = await buildService({ ANTHROPIC_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await expect(service.answer('hi', KB)).resolves.toBeNull();
  });

  it('returns null when the response has no tool_use block (model ignored tool_choice)', async () => {
    const service = await buildService({ ANTHROPIC_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text' }] }),
    });

    await expect(service.answer('hi', KB)).resolves.toBeNull();
  });

  it('returns null when the tool_use input is missing required fields', async () => {
    const service = await buildService({ ANTHROPIC_API_KEY: 'key-123' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            {
              type: 'tool_use',
              name: 'submit_answer',
              input: { answer: 'hi' },
            },
          ],
        }),
    });

    await expect(service.answer('hi', KB)).resolves.toBeNull();
  });
});
