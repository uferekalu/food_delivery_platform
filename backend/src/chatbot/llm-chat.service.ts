import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 512;

export interface KnowledgeBaseGroundingEntry {
  question: string;
  answer: string;
  category: string;
}

export interface LlmChatAnswer {
  answer: string;
  /** true only when the model judges its answer genuinely grounded in the knowledge base
   * supplied below (or a simple greeting) — false triggers the caller's existing human-fallback
   * path (a support ticket), exactly as an ungrounded keyword-match score would have. */
  confident: boolean;
}

const SYSTEM_PROMPT = `You are the support assistant for a food/grocery/pharmacy delivery marketplace's in-app chat widget. You help visitors with questions about ordering, delivery, tracking, payments, refunds, promo codes, becoming a vendor or rider, and account issues on this specific platform.

Rules:
- Answer platform-specific facts (fees, policies, timelines, how things work) ONLY using the knowledge base entries provided in the user message. Never invent a policy detail that isn't grounded there.
- If the visitor's message is a simple greeting or small talk, respond warmly and briefly, and set confident to true.
- If the question is unrelated to this platform, or you don't have enough grounded information in the knowledge base to answer it confidently, say so honestly in one short sentence and mention you're passing it to the human support team — set confident to false in that case.
- Never claim to be human. Keep answers concise (2-4 sentences), warm, and conversational — not robotic.
- You must always respond by calling the submit_answer tool, never with plain text.`;

const SUBMIT_ANSWER_TOOL = {
  name: 'submit_answer',
  description:
    "Submit your reply to the visitor and whether you're confident it's accurate and grounded.",
  input_schema: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description: 'The reply to show the visitor.',
      },
      confident: {
        type: 'boolean',
        description:
          'true only if grounded in the supplied knowledge base or a simple greeting; false if the question is unrelated to this platform or under-informed.',
      },
    },
    required: ['answer', 'confident'],
  },
};

interface AnthropicToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

interface AnthropicMessagesResponse {
  content: (AnthropicToolUseBlock | { type: string })[];
}

/**
 * LLM-backed chat answers (docs/ROADMAP.md FDP-110), replacing the plain keyword-matched
 * knowledge-base lookup (docs/ROADMAP.md FDP-106) as the chatbot's primary path — a real user
 * complaint: asking the old bot a simple "hi" produced the canned human-escalation fallback,
 * which reads as unintelligent for something meant to feel like a support chat. Deliberately
 * kept *grounded*, not a general-purpose assistant: the knowledge base is the only source of
 * truth for platform-specific facts, and the model is instructed to signal low confidence
 * (rather than guess) for anything outside that — preserving the original design's "scoped tool
 * with a hard human fallback" safety property (see chatbot.service.ts's own doc comment) while
 * making the *phrasing* intelligent instead of template-matched.
 *
 * A plain `fetch` call against Anthropic's REST API, not the `@anthropic-ai/sdk` package — same
 * "no new dependency for a single endpoint" choice as SmsService's Termii integration. Uses
 * Anthropic's tool-use feature (forced via `tool_choice`) to get back a real parsed JSON object
 * rather than trusting free-form text to happen to be valid JSON.
 */
@Injectable()
export class LlmChatService {
  private readonly logger = new Logger(LlmChatService.name);
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /** Never throws — any misconfiguration, network failure, or unexpected response shape returns
   * `null`, letting the caller fall back to the deterministic keyword matcher exactly as if the
   * LLM path didn't exist (same graceful-degradation contract as SmsService.send()). */
  async answer(
    message: string,
    knowledgeBase: KnowledgeBaseGroundingEntry[],
  ): Promise<LlmChatAnswer | null> {
    if (!this.isConfigured) return null;

    try {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Knowledge base (JSON — your only source of truth for platform facts):\n${JSON.stringify(knowledgeBase)}\n\nVisitor message: ${message}`,
            },
          ],
          tools: [SUBMIT_ANSWER_TOOL],
          tool_choice: { type: 'tool', name: SUBMIT_ANSWER_TOOL.name },
        }),
      });

      if (!res.ok) {
        this.logger.error(
          `Anthropic API call failed with status ${res.status}: ${await res.text()}`,
        );
        return null;
      }

      const data = (await res.json()) as AnthropicMessagesResponse;
      const toolUse = data.content.find(
        (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
      );
      const input = toolUse?.input as
        { answer?: unknown; confident?: unknown } | undefined;
      if (
        typeof input?.answer !== 'string' ||
        typeof input.confident !== 'boolean'
      ) {
        this.logger.error(
          'Anthropic API response did not include a valid submit_answer tool call',
        );
        return null;
      }

      return { answer: input.answer, confident: input.confident };
    } catch (err) {
      this.logger.error(`Anthropic API call threw: ${(err as Error).message}`);
      return null;
    }
  }
}
