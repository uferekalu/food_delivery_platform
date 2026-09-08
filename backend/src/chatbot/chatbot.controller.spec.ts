import { BadRequestException } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';

describe('ChatbotController — identity resolution (docs/ROADMAP.md FDP-106)', () => {
  let ask: jest.Mock;
  let history: jest.Mock;
  let controller: ChatbotController;

  beforeEach(() => {
    ask = jest.fn().mockResolvedValue({ answer: 'ok', matched: true });
    history = jest.fn().mockResolvedValue([]);
    controller = new ChatbotController({
      ask,
      history,
    } as unknown as ChatbotService);
  });

  it('identifies a logged-in visitor by their own account, ignoring any sessionId sent alongside', async () => {
    await controller.ask(
      { sub: 'user-1', email: 'a@example.com', role: 'customer' },
      { message: 'hi', sessionId: 'ignored-session' },
    );

    expect(ask).toHaveBeenCalledWith(
      { userId: 'user-1', sessionId: null },
      { message: 'hi', sessionId: 'ignored-session' },
    );
  });

  it('identifies a guest by their sessionId when no user is present', async () => {
    await controller.ask(null, { message: 'hi', sessionId: 'session-abc' });

    expect(ask).toHaveBeenCalledWith(
      { userId: null, sessionId: 'session-abc' },
      { message: 'hi', sessionId: 'session-abc' },
    );
  });

  it('rejects a guest request with neither a user nor a sessionId', () => {
    // resolveIdentity throws synchronously (ask/history aren't `async`, so the exception
    // surfaces immediately at the call site, not as a rejected Promise).
    expect(() => controller.ask(null, { message: 'hi' })).toThrow(
      BadRequestException,
    );
    expect(ask).not.toHaveBeenCalled();
  });

  it('history resolves identity the same way as ask', async () => {
    await controller.history(
      { sub: 'user-1', email: 'a@example.com', role: 'customer' },
      { sessionId: 'ignored' },
    );

    expect(history).toHaveBeenCalledWith({ userId: 'user-1', sessionId: null });
  });

  it('history rejects a guest request with no sessionId', () => {
    expect(() => controller.history(null, {})).toThrow(BadRequestException);
  });
});
