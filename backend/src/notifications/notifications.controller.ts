import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly pushService: PushService,
  ) {}

  // Declared before `:id/read` — a literal path segment ("push") would otherwise never be
  // reached if it came after a route with a leading param, same lesson as `/restaurants/mine`.
  // Not `@Public()`: the key itself isn't sensitive, but there's no reason to expose it to a
  // caller who isn't about to use it, and every other endpoint here already requires auth.
  @Get('push/public-key')
  getPushPublicKey(): { publicKey: string | null } {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('push/subscribe')
  async subscribeToPush(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubscribePushDto,
  ): Promise<{ success: true }> {
    await this.pushService.subscribe(user.sub, dto);
    return { success: true };
  }

  @Delete('push/subscribe')
  async unsubscribeFromPush(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UnsubscribePushDto,
  ): Promise<{ success: true }> {
    await this.pushService.unsubscribe(user.sub, dto.endpoint);
    return { success: true };
  }

  @Get()
  findMine(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationsService.findMine(user.sub, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AccessTokenPayload) {
    return { count: await this.notificationsService.unreadCount(user.sub) };
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: AccessTokenPayload) {
    await this.notificationsService.markAllRead(user.sub);
    return { success: true };
  }
}
