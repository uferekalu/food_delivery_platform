import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ExchangeOAuthCodeDto {
  @ApiProperty()
  @IsString()
  code: string;
}
