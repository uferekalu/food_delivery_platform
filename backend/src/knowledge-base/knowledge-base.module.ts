import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  KnowledgeBaseEntry,
  KnowledgeBaseEntrySchema,
} from './schemas/knowledge-base-entry.schema';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeBaseEntry.name, schema: KnowledgeBaseEntrySchema },
    ]),
  ],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
