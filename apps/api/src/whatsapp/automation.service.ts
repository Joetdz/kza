import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AutomationEvent = 'welcome' | 'message' | 'no_reply' | 'out_of_hours' | 'lead_status' | 'tag_added';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Process automations for a given contact event.
   * Returns an array of messages to send back (if any).
   */
  async process(
    userId: string,
    contactId: string,
    event: AutomationEvent,
    context: Record<string, any> = {},
  ): Promise<string[]> {
    const automations = await this.prisma.whatsAppAutomation.findMany({
      where: { userId, enabled: true, trigger: event },
    });

    const messagesToSend: string[] = [];

    for (const auto of automations) {
      const triggerConfig = auto.triggerConfig as Record<string, any>;
      const actionConfig = auto.actionConfig as Record<string, any>;

      // Évaluer la condition du déclencheur
      if (!this.matchesTrigger(event, triggerConfig, context)) continue;

      // Exécuter l'action
      switch (auto.action) {
        case 'send_message':
          if (actionConfig.message) {
            messagesToSend.push(actionConfig.message);
          }
          break;

        case 'assign_agent':
          if (actionConfig.agentEmail) {
            await this.prisma.whatsAppContact.update({
              where: { id: contactId },
              data: { assignedAgent: actionConfig.agentEmail },
            });
          }
          break;

        case 'change_status':
          if (actionConfig.status) {
            await this.prisma.whatsAppContact.update({
              where: { id: contactId },
              data: { leadStatus: actionConfig.status },
            });
          }
          break;

        case 'add_tag':
          if (actionConfig.tagId) {
            await this.prisma.whatsAppContactTag.upsert({
              where: { contactId_tagId: { contactId, tagId: actionConfig.tagId } },
              create: { contactId, tagId: actionConfig.tagId },
              update: {},
            });
          }
          break;

        case 'disable_ai':
          await this.prisma.whatsAppContact.update({
            where: { id: contactId },
            data: { aiEnabled: false },
          });
          break;
      }
    }

    return messagesToSend;
  }

  private matchesTrigger(
    event: AutomationEvent,
    config: Record<string, any>,
    context: Record<string, any>,
  ): boolean {
    switch (event) {
      case 'welcome':
        return true; // Toujours déclencher sur premier message

      case 'message':
        if (config.keywords && Array.isArray(config.keywords)) {
          const msg = (context.message ?? '').toLowerCase();
          return config.keywords.some((kw: string) => msg.includes(kw.toLowerCase()));
        }
        return true;

      case 'lead_status':
        return config.status === context.status;

      case 'tag_added':
        return config.tagId === context.tagId;

      default:
        return true;
    }
  }
}
