import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class UnsubscribePushDto {
  // See SubscribePushDto's endpoint field for why `require_tld` is left at its default (true).
  @ApiProperty()
  @IsUrl({ require_protocol: true })
  endpoint: string;
}
