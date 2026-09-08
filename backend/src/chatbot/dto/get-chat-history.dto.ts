import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The `GET /chatbot/history` query param — was a bare `@Query('sessionId') sessionId?: string`
 * (docs/ROADMAP.md FDP-109 audit), a primitive-typed param the global `ValidationPipe` does
 * nothing for (no `class-validator` metadata to check against), unlike every other input in this
 * codebase. Not currently exploitable as a NoSQL-injection vector — Express 5 defaults to the
 * `'simple'` query parser, so `?sessionId[$ne]=x` never becomes a nested object here — but that's
 * an Express default this app doesn't control and isn't the kind of thing an unauthenticated,
 * `@Public()` route's only defense should rest on.
 */
export class GetChatHistoryDto {
  @ApiPropertyOptional({
    description:
      'A client-generated id identifying an unauthenticated visitor across messages. Required when no access token is sent; ignored (the real account is used instead) when one is.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionId?: string;
}
