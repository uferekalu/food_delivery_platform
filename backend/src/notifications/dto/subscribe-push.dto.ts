import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsString, IsUrl, ValidateNested } from 'class-validator';

export class PushSubscriptionKeysDto {
  @ApiProperty()
  @IsString()
  p256dh: string;

  @ApiProperty()
  @IsString()
  auth: string;
}

// Matches the browser's `PushSubscriptionJSON` shape (`pushManager.subscribe()`'s return value,
// JSON-serialized) verbatim — `expirationTime` is part of that shape too but unused here, so
// it's simply not declared (the global `ValidationPipe`'s `forbidNonWhitelisted` would otherwise
// reject the real payload the frontend sends unless it's stripped client-side first).
export class SubscribePushDto {
  // A push endpoint is always issued by a real push service (FCM, Mozilla's autopush, etc.) with
  // a genuine public https URL, regardless of whether the app itself runs on localhost — no
  // reason to loosen this. `require_tld: false` was tried here initially and turned out to
  // accept literally any protocol/dot-free string ('not-a-url' included), defeating the check
  // entirely; caught by an e2e test expecting a 400 on a malformed payload and getting a 201.
  @ApiProperty()
  @IsUrl({ require_protocol: true })
  endpoint: string;

  // @IsDefined() alongside @ValidateNested(): the latter alone only validates keys *if present*,
  // it doesn't require presence — a request with `keys` omitted entirely would otherwise pass.
  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
