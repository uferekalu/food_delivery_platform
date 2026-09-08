import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AskChatbotDto {
  @ApiProperty({ example: 'What areas do you deliver to?' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({
    description:
      'A client-generated id identifying an unauthenticated visitor across messages. Required when no access token is sent; ignored (the real account is used instead) when one is.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionId?: string;
}
