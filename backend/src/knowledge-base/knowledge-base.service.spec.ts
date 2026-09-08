import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import {
  KnowledgeBaseService,
  MATCH_CONFIDENCE_THRESHOLD,
} from './knowledge-base.service';
import {
  KnowledgeBaseEntry,
  KnowledgeBaseEntryDocument,
  KnowledgeBaseEntrySchema,
} from './schemas/knowledge-base-entry.schema';

jest.setTimeout(30_000);

describe('KnowledgeBaseService (docs/ROADMAP.md FDP-106)', () => {
  let mongod: MongoMemoryServer;
  let moduleRef: TestingModule;
  let service: KnowledgeBaseService;
  let entryModel: Model<KnowledgeBaseEntryDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({
      instance: { launchTimeout: 60_000 },
    });

    moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: KnowledgeBaseEntry.name, schema: KnowledgeBaseEntrySchema },
        ]),
      ],
      providers: [KnowledgeBaseService],
    }).compile();

    service = moduleRef.get(KnowledgeBaseService);
    entryModel = moduleRef.get(getModelToken(KnowledgeBaseEntry.name));
  }, 60_000);

  afterEach(async () => {
    await entryModel.deleteMany({}).exec();
  });

  afterAll(async () => {
    await moduleRef.close();
    await mongod.stop();
  });

  function createEntry(overrides: Partial<KnowledgeBaseEntry> = {}) {
    return entryModel.create({
      question: 'What areas do you deliver to?',
      answer: 'We deliver within each seller’s own delivery zone.',
      keywords: ['delivery area', 'where do you deliver'],
      category: 'delivery',
      isActive: true,
      ...overrides,
    });
  }

  describe('match', () => {
    it('matches a multi-word keyword phrase and reports it above the confidence threshold', async () => {
      await createEntry();

      const result = await service.match('Hey, what is your delivery area?');

      expect(result).not.toBeNull();
      expect(result?.aboveThreshold).toBe(true);
      expect(result?.entry.category).toBe('delivery');
    });

    it('weighs a multi-word keyword phrase higher than a single-word one, so a two-word hit alone can clear the threshold', async () => {
      // "delivery area" is 2 words -> score 2, meeting MATCH_CONFIDENCE_THRESHOLD (2) on its own.
      expect(MATCH_CONFIDENCE_THRESHOLD).toBe(2);
      await createEntry({ keywords: ['delivery area'] });

      const result = await service.match('delivery area please');

      expect(result?.score).toBe(2);
      expect(result?.aboveThreshold).toBe(true);
    });

    it('is case- and punctuation-insensitive', async () => {
      await createEntry({ keywords: ['refund policy'] });

      const result = await service.match("What's your REFUND-POLICY?!");

      expect(result?.aboveThreshold).toBe(true);
    });

    it('returns the best-scoring entry but marks it below threshold when the match is too weak', async () => {
      // A single one-word keyword hit scores 1, below MATCH_CONFIDENCE_THRESHOLD (2).
      await createEntry({ keywords: ['refund'] });

      const result = await service.match('I want a refund');

      expect(result).not.toBeNull();
      expect(result?.score).toBe(1);
      expect(result?.aboveThreshold).toBe(false);
    });

    it('returns null when nothing matches at all', async () => {
      await createEntry({ keywords: ['refund policy'] });

      const result = await service.match('what time do you open');

      expect(result).toBeNull();
    });

    it('excludes an inactive entry from matching', async () => {
      await createEntry({ keywords: ['delivery area'], isActive: false });

      const result = await service.match('delivery area');

      expect(result).toBeNull();
    });

    it('picks the highest-scoring entry when more than one matches', async () => {
      await createEntry({
        keywords: ['delivery'],
        category: 'weak-match',
      });
      await createEntry({
        keywords: ['delivery fee', 'how much is delivery'],
        category: 'strong-match',
      });

      const result = await service.match(
        'how much is delivery, and what is the delivery fee?',
      );

      expect(result?.entry.category).toBe('strong-match');
    });
  });

  describe('findActiveForGrounding (docs/ROADMAP.md FDP-110)', () => {
    it('returns every active entry as a plain question/answer/category projection, excluding inactive ones', async () => {
      await createEntry({
        question: 'Active Q',
        answer: 'Active A',
        category: 'active-cat',
      });
      await createEntry({
        question: 'Inactive Q',
        answer: 'Inactive A',
        isActive: false,
      });

      const grounding = await service.findActiveForGrounding();

      expect(grounding).toEqual([
        { question: 'Active Q', answer: 'Active A', category: 'active-cat' },
      ]);
    });
  });

  describe('CRUD', () => {
    it('create/findAll/update/remove round-trip', async () => {
      const created = await service.create({
        question: 'Do you deliver on weekends?',
        answer: 'Yes, every day.',
        keywords: ['weekend delivery'],
        category: 'delivery',
      });

      const all = await service.findAll();
      expect(all.map((e) => e._id.toString())).toContain(
        created._id.toString(),
      );

      const updated = await service.update(created._id.toString(), {
        answer: 'Yes, 7 days a week.',
      });
      expect(updated.answer).toBe('Yes, 7 days a week.');

      await service.remove(created._id.toString());
      await expect(
        service.update(created._id.toString(), { answer: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('findAll includes inactive entries (the admin management view)', async () => {
      await createEntry({ isActive: false });

      const all = await service.findAll();

      expect(all).toHaveLength(1);
    });

    it('remove throws NotFoundException for an unknown id', async () => {
      await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
