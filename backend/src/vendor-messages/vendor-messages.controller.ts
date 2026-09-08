import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { VendorMessagesService } from './vendor-messages.service';
import { SendVendorMessageDto } from './dto/send-vendor-message.dto';

/** Admin<->vendor messaging (docs/ROADMAP.md FDP-108) — the vendor's own conversation with
 * "admin" as a role, not a specific admin. Own thread only — a vendor never sees anyone else's
 * conversation, unlike the admin-side endpoints in `admin-vendor-conversations.controller.ts`. */
@ApiTags('vendor-messages')
@Controller('vendor-messages')
@Roles('restaurant_owner')
export class VendorMessagesController {
  constructor(private readonly vendorMessagesService: VendorMessagesService) {}

  @Get()
  getMessages(@CurrentUser() user: AccessTokenPayload) {
    return this.vendorMessagesService.getMessages(user.sub);
  }

  @Post()
  sendMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SendVendorMessageDto,
  ) {
    return this.vendorMessagesService.sendFromVendor(user.sub, dto.body);
  }

  @Patch('read')
  markRead(@CurrentUser() user: AccessTokenPayload) {
    return this.vendorMessagesService.markReadByVendor(user.sub);
  }
}
