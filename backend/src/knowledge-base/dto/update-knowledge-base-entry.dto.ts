import { PartialType } from '@nestjs/swagger';
import { CreateKnowledgeBaseEntryDto } from './create-knowledge-base-entry.dto';

export class UpdateKnowledgeBaseEntryDto extends PartialType(
  CreateKnowledgeBaseEntryDto,
) {}
