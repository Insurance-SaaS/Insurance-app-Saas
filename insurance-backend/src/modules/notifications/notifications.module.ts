import { Global, Module, OnModuleInit } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { FcmService } from './services/fcm.service';
import { DeviceTokenService } from './services/device-token.service';
import { NotificationHistoryService } from './services/notification-history.service';
import { ClaimNotificationListener } from './listeners/claim-notification.listener';
import { PluginRegistryService } from 'src/core/plugin-registry/plugin-registry.service';
import { NOTIFICATIONS_PLUGIN } from './notifications.plugin';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    FcmService,
    DeviceTokenService,
    NotificationHistoryService,
    ClaimNotificationListener,
  ],
  exports: [FcmService, DeviceTokenService, NotificationHistoryService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(private readonly pluginRegistry: PluginRegistryService) {}
  onModuleInit() {
    this.pluginRegistry.registerPlugin(NOTIFICATIONS_PLUGIN);
  }
}
