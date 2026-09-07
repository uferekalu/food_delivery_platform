import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeBaseEntryDto } from './dto/create-knowledge-base-entry.dto';
import { UpdateKnowledgeBaseEntryDto } from './dto/update-knowledge-base-entry.dto';

/** Support chat widget (docs/ROADMAP.md FDP-106) — admin-only management of the FAQ entries the
 * chatbot matches against. Nothing here is `@Public()`; the visitor-facing side lives entirely
 * in `ChatbotController`, which only ever reads matched *answers*, never these management
 * routes. */
@ApiTags('knowledge-base')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Roles('admin')
  @Get()
  findAll() {
    return this.knowledgeBaseService.findAll();
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateKnowledgeBaseEntryDto) {
    return this.knowledgeBaseService.create(dto);
  }

  @Roles('admin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeBaseEntryDto) {
    return this.knowledgeBaseService.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledgeBaseService.remove(id);
  }
}
