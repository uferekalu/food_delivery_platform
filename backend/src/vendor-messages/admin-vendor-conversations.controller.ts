import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { VendorMessagesService } from './vendor-messages.service';
import { SendVendorMessageDto } from './dto/send-vendor-message.dto';
import { ListVendorConversationsDto } from './dto/list-vendor-conversations.dto';

/** Admin<->vendor messaging (docs/ROADMAP.md FDP-108) — admin-only, any admin can view/reply to
 * any vendor's thread (mirrors how support tickets are worked by "admin" as a role). Kept on a
 * distinct `admin/vendor-conversations` path from `vendor-messages.controller.ts`'s `/vendor-
 * messages` so the vendor's own-thread-only routes and these any-vendor routes never collide. */
@ApiTags('admin-vendor-conversations')
@Controller('admin/vendor-conversations')
@Roles('admin')
export class AdminVendorConversationsController {
  constructor(private readonly vendorMessagesService: VendorMessagesService) {}

  @Get()
  listConversations(@Query() query: ListVendorConversationsDto) {
    return this.vendorMessagesService.listConversationsForAdmin({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get(':vendorId/messages')
  getMessages(@Param('vendorId') vendorId: string) {
    return this.vendorMessagesService.getMessages(vendorId);
  }

  @Post(':vendorId/messages')
  sendMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('vendorId') vendorId: string,
    @Body() dto: SendVendorMessageDto,
  ) {
    return this.vendorMessagesService.sendFromAdmin(
      user.sub,
      vendorId,
      dto.body,
    );
  }

  @Patch(':vendorId/read')
  markRead(@Param('vendorId') vendorId: string) {
    return this.vendorMessagesService.markReadByAdmin(vendorId);
  }
}
