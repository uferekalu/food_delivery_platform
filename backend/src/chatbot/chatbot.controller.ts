import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUserOptional } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { ChatbotService } from './chatbot.service';
import { AskChatbotDto } from './dto/ask-chatbot.dto';
import type { ChatIdentity } from '../support-tickets/chat-identity';

/** Support chat widget (docs/ROADMAP.md FDP-106) — the only two routes a visitor (logged in or
 * not) ever touches directly; everything else (knowledge-base management, ticket resolution) is
 * admin-only and lives in its own module. `@Public()` + `OptionalJwtAuthGuard` together (see that
 * guard's own doc comment) let one route serve both a real account and a guest session. */
@ApiTags('chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  // A real, if modest, abuse surface — an unauthenticated endpoint that writes to the database
  // on every call (a ChatMessage, sometimes a SupportTicket + admin notifications too). Tighter
  // than the app-wide 100/min default, generous enough for a real back-and-forth conversation.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('ask')
  ask(
    @CurrentUserOptional() user: AccessTokenPayload | null,
    @Body() dto: AskChatbotDto,
  ) {
    return this.chatbotService.ask(this.resolveIdentity(user, dto.sessionId), dto);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('history')
  history(
    @CurrentUserOptional() user: AccessTokenPayload | null,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.chatbotService.history(this.resolveIdentity(user, sessionId));
  }

  private resolveIdentity(
    user: AccessTokenPayload | null,
    sessionId: string | undefined,
  ): ChatIdentity {
    if (user) return { userId: user.sub, sessionId: null };
    if (sessionId) return { userId: null, sessionId };
    throw new BadRequestException(
      'sessionId is required when not logged in',
    );
  }
}
