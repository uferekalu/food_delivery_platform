import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { SupportTicketsService } from './support-tickets.service';
import { ListSupportTicketsDto } from './dto/list-support-tickets.dto';

/** Support chat widget (docs/ROADMAP.md FDP-106) — admin-only. Ticket *creation* is never a
 * direct route here; it only ever happens as a side effect of `ChatbotService.ask` when a
 * question doesn't confidently match the knowledge base. */
@ApiTags('support-tickets')
@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Roles('admin')
  @Get()
  listAll(@Query() query: ListSupportTicketsDto) {
    return this.supportTicketsService.listAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
    });
  }

  @Roles('admin')
  @Patch(':id/resolve')
  resolve(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.supportTicketsService.resolve(id, user.sub);
  }
}
