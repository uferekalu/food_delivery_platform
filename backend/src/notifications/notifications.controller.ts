import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/interfaces/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
