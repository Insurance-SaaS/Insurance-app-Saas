import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ClaimStatusChangedEvent } from 'src/contracts/events/domain-events';
import { FcmService } from '../services/fcm.service';
import { NotificationType } from '../entities/notification.entity';
import { TenantContextRunner } from 'src/core/tenant/tenant-context.runner';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { NOTIFICATIONS_PLUGIN } from '../notifications.plugin';

/**
 * Listens for claim domain events and sends push notifications.
 *
 * This replaces the direct ClaimsService → FcmService coupling.
 * ClaimsService emits events; this listener reacts independently.
 */
@Injectable()
export class ClaimNotificationListener {
  private readonly logger = new Logger(ClaimNotificationListener.name);

  constructor(
    private readonly fcmService: FcmService,
    private readonly tenantRunner: TenantContextRunner,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(ClaimStatusChangedEvent.key, { async: true })
  async handleClaimStatusChanged(event: ClaimStatusChangedEvent): Promise<void> {
    try {
      // The event names its tenant; do not rely on whatever request happens to be around.
      await this.tenantRunner.run(event.data.tenantSlug, () => this.notify(event));
    } catch (error) {
      this.logger.error(`Failed to send notification for claim ${event.data.claimId}:`, error);
      // Don't throw — notification failure shouldn't propagate to the emitter
    }
  }

  private async notify(event: ClaimStatusChangedEvent): Promise<void> {
    if (!this.tenantContext.isPluginEnabled(NOTIFICATIONS_PLUGIN.id)) {
      this.logger.debug('Notifications are disabled for this tenant, skipping');
      return;
    }
    if (!this.fcmService.isInitialized()) {
      this.logger.debug('FCM not initialized, skipping notification');
      return;
    }

    const { claimId, userId, newStatus, oldStatus, numDossier, expertFullName, userLanguage } =
      event.data;

    const message = this.getStatusNotificationMessage(
      newStatus,
      numDossier,
      expertFullName,
      userLanguage,
    );

    const dataPayload: Record<string, string> = {
      type: 'claim_update',
      sinisterId: claimId,
      numDossier,
      status: newStatus,
      oldStatus: oldStatus || '',
      timestamp: new Date().toISOString(),
    };

    if (expertFullName) {
      dataPayload.expertName = expertFullName;
    }

    await this.fcmService.sendToUser(
      userId,
      { title: message.title, body: message.body },
      dataPayload,
      {
        type: NotificationType.CLAIM_UPDATE,
        referenceId: claimId,
        referenceType: 'sinister',
      },
    );

    this.logger.log(
      `✅ Sent ${newStatus} notification for claim #${numDossier} to user ${userId}`,
    );
  }

  /**
   * Build localised notification message based on status and language.
   */
  private getStatusNotificationMessage(
    status: string,
    numDossier: string,
    expertFullName?: string,
    language: string = 'en',
  ): { title: string; body: string } {
    const dossierRef = `#${numDossier}`;

    const messages: Record<string, Record<string, { title: string; body: string }>> = {
      SUBMITTED: {
        en: {
          title: 'Claim Submitted',
          body: `Your claim ${dossierRef} has been successfully submitted and is being processed.`,
        },
        fr: {
          title: 'Réclamation Soumise',
          body: `Votre réclamation ${dossierRef} a été soumise avec succès et est en cours de traitement.`,
        },
        ar: {
          title: 'تم تقديم المطالبة',
          body: `تم تقديم مطالبتك ${dossierRef} بنجاح وهي قيد المعالجة.`,
        },
      },
      IN_REVIEW: {
        en: {
          title: 'Claim Under Review',
          body: expertFullName
            ? `Your claim ${dossierRef} is now under review by expert ${expertFullName}.`
            : `Your claim ${dossierRef} is now under review.`,
        },
        fr: {
          title: 'Réclamation en Révision',
          body: expertFullName
            ? `Votre réclamation ${dossierRef} est maintenant en révision par l'expert ${expertFullName}.`
            : `Votre réclamation ${dossierRef} est maintenant en révision.`,
        },
        ar: {
          title: 'المطالبة قيد المراجعة',
          body: expertFullName
            ? `مطالبتك ${dossierRef} قيد المراجعة الآن من قبل الخبير ${expertFullName}.`
            : `مطالبتك ${dossierRef} قيد المراجعة الآن.`,
        },
      },
      APPROVED: {
        en: {
          title: 'Claim Approved',
          body: `Great news! Your claim ${dossierRef} has been approved.`,
        },
        fr: {
          title: 'Réclamation Approuvée',
          body: `Excellente nouvelle ! Votre réclamation ${dossierRef} a été approuvée.`,
        },
        ar: {
          title: 'تمت الموافقة على المطالبة',
          body: `أخبار رائعة! تمت الموافقة على مطالبتك ${dossierRef}.`,
        },
      },
      REJECTED: {
        en: {
          title: 'Claim Rejected',
          body: `Your claim ${dossierRef} has been rejected. Please contact support for more information.`,
        },
        fr: {
          title: 'Réclamation Rejetée',
          body: `Votre réclamation ${dossierRef} a été rejetée. Veuillez contacter le support pour plus d'informations.`,
        },
        ar: {
          title: 'تم رفض المطالبة',
          body: `تم رفض مطالبتك ${dossierRef}. يرجى الاتصال بالدعم لمزيد من المعلومات.`,
        },
      },
      CLOSED: {
        en: {
          title: 'Claim Closed',
          body: `Your claim ${dossierRef} has been closed.`,
        },
        fr: {
          title: 'Réclamation Fermée',
          body: `Votre réclamation ${dossierRef} a été fermée.`,
        },
        ar: {
          title: 'تم إغلاق المطالبة',
          body: `تم إغلاق مطالبتك ${dossierRef}.`,
        },
      },
    };

    const lang = language === 'fr' || language === 'ar' ? language : 'en';
    const statusMessages = messages[status];
    if (!statusMessages) {
      return { title: 'Claim Update', body: `Your claim ${dossierRef} has been updated.` };
    }
    return statusMessages[lang] || statusMessages['en'];
  }
}
