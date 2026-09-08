import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  KnowledgeBaseEntry,
  KnowledgeBaseEntryDocument,
} from './schemas/knowledge-base-entry.schema';
import { CreateKnowledgeBaseEntryDto } from './dto/create-knowledge-base-entry.dto';
import { UpdateKnowledgeBaseEntryDto } from './dto/update-knowledge-base-entry.dto';

// Support chat widget (docs/ROADMAP.md FDP-106) — a plain exported constant, same "single
// source, easy to tune without touching logic" convention as PLATFORM_COMMISSION_RATE
// (common/constants/platform-fee.ts). A message's best-scoring entry needs at least this many
// matched "keyword weight" points (see `match` below) to count as a confident answer rather than
// a guess — tuned empirically once real questions start coming in, not derived from anything.
export const MATCH_CONFIDENCE_THRESHOLD = 2;

export interface KnowledgeBaseMatch {
  entry: KnowledgeBaseEntryDocument;
  score: number;
  aboveThreshold: boolean;
}

// Lowercases, strips punctuation to whitespace, collapses runs of whitespace — applied to both
// the visitor's message and every keyword before comparing, so "What's your delivery fee?!"
// still matches a "delivery fee" keyword.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectModel(KnowledgeBaseEntry.name)
    private readonly entryModel: Model<KnowledgeBaseEntryDocument>,
  ) {}

  async create(
    dto: CreateKnowledgeBaseEntryDto,
  ): Promise<KnowledgeBaseEntryDocument> {
    return this.entryModel.create(dto);
  }

  /** Admin management view — every entry, active or not (an admin toggling one back on needs to
   * see it in the list first). */
  findAll(): Promise<KnowledgeBaseEntryDocument[]> {
    return this.entryModel.find().sort({ category: 1, question: 1 }).exec();
  }

  private findActive(): Promise<KnowledgeBaseEntryDocument[]> {
    return this.entryModel.find({ isActive: true }).exec();
  }

  /** The LLM chatbot's grounding context (docs/ROADMAP.md FDP-110) — unlike `match()`'s single
   * best-scoring entry, the model gets the whole active knowledge base on every call so it can
   * synthesize an answer drawing on more than one entry, phrased naturally rather than returned
   * verbatim. Stays a plain question/answer/category projection, not the full Mongoose document
   * — this crosses into an LLM prompt, not another part of this codebase. */
  async findActiveForGrounding(): Promise<
    { question: string; answer: string; category: string }[]
  > {
    const entries = await this.findActive();
    return entries.map((e) => ({
      question: e.question,
      answer: e.answer,
      category: e.category,
    }));
  }

  async update(
    id: string,
    dto: UpdateKnowledgeBaseEntryDto,
  ): Promise<KnowledgeBaseEntryDocument> {
    const entry = await this.entryModel
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();
    if (!entry) throw new NotFoundException('Knowledge base entry not found');
    return entry;
  }

  async remove(id: string): Promise<void> {
    const result = await this.entryModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Knowledge base entry not found');
    }
  }

  /**
   * The chatbot's entire "understanding" — scores every active entry by how many of its
   * keywords appear as substrings in the visitor's (normalized) message, weighting a multi-word
   * keyword phrase higher than a single word (more specific match, more confidence), and returns
   * the top scorer. `aboveThreshold` tells the caller whether this is confident enough to answer
   * with directly; the entry is still returned even when it isn't, purely so a fallback support
   * ticket can record "the closest the bot got was this entry" as admin context for tuning the
   * knowledge base later — never shown to the visitor in that case.
   */
  async match(message: string): Promise<KnowledgeBaseMatch | null> {
    const normalizedMessage = normalize(message);
    if (!normalizedMessage) return null;

    const entries = await this.findActive();
    let best: KnowledgeBaseMatch | null = null;

    for (const entry of entries) {
      let score = 0;
      for (const keyword of entry.keywords) {
        const normalizedKeyword = normalize(keyword);
        if (!normalizedKeyword) continue;
        if (normalizedMessage.includes(normalizedKeyword)) {
          score += normalizedKeyword.split(' ').length;
        }
      }
      if (score > 0 && (!best || score > best.score)) {
        best = {
          entry,
          score,
          aboveThreshold: score >= MATCH_CONFIDENCE_THRESHOLD,
        };
      }
    }

    return best;
  }
}
