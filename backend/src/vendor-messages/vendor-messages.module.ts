import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  VendorMessage,
  VendorMessageSchema,
} from './schemas/vendor-message.schema';
import {
  VendorConversation,
  VendorConversationSchema,
} from './schemas/vendor-conversation.schema';
import { VendorMessagesService } from './vendor-messages.service';
import { VendorMessagesController } from './vendor-messages.controller';
import { AdminVendorConversationsController } from './admin-vendor-conversations.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VendorMessage.name, schema: VendorMessageSchema },
      { name: VendorConversation.name, schema: VendorConversationSchema },
    ]),
    // Same safe, non-circular additions already documented for this exact need in
    // support-tickets.module.ts/orders.module.ts/payouts.module.ts.
    NotificationsModule,
    UsersModule,
    RealtimeModule,
  ],
  controllers: [VendorMessagesController, AdminVendorConversationsController],
  providers: [VendorMessagesService],
  exports: [VendorMessagesService],
})
export class VendorMessagesModule {}
