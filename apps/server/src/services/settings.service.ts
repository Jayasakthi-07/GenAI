import {
  type OrganizationDto,
  type OrganizationUpdate,
  organizationUpdateSchema,
  orgSettingsSchema,
} from '@stockroom/shared';
import type { Prisma } from '#generated/prisma/client.ts';
import type { Db } from '../db/client';
import { inTransaction } from '../db/tx';
import { type Actor, assertCan } from '../domain/actor';
import { writeAudit } from '../domain/audit';
import type { EventBus } from '../domain/events';
import { getOrgSettings, invalidateOrgSettings, ORG_DEFAULTS } from './support';

/** Organization profile and the operational settings agents and services read (service level, thresholds, budget). */
export class SettingsService {
  constructor(
    private readonly prisma: Db,
    private readonly bus: EventBus,
  ) {}

  async organization(actor: Actor): Promise<OrganizationDto> {
    assertCan(actor, 'inventory.view');
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    const s = await getOrgSettings(this.prisma);
    return {
      name: org?.name ?? ORG_DEFAULTS.name,
      legalName: org?.legalName ?? null,
      gstin: org?.gstin ?? null,
      address: org?.address ?? null,
      currency: org?.currency ?? 'INR',
      locale: org?.locale ?? 'en-IN',
      timezone: org?.timezone ?? 'Asia/Kolkata',
      settings: orgSettingsSchema.parse({ ...ORG_DEFAULTS, ...s }),
    };
  }

  async updateOrganization(actor: Actor, raw: OrganizationUpdate): Promise<OrganizationDto> {
    assertCan(actor, 'organization.manage');
    const input = organizationUpdateSchema.parse(raw);
    await inTransaction(this.prisma, this.bus, async (tx, emit) => {
      const org = await tx.organization.findFirst({ orderBy: { createdAt: 'asc' } });
      const data = {
        name: input.name,
        legalName: input.legalName,
        gstin: input.gstin,
        address: input.address,
        settings: input.settings as Prisma.InputJsonValue,
      };
      const saved = org
        ? await tx.organization.update({ where: { id: org.id }, data })
        : await tx.organization.create({ data });
      await writeAudit(tx, actor, {
        action: 'organization.update',
        entityType: 'Organization',
        entityId: saved.id,
        summary: 'Updated organization settings',
        before: org
          ? {
              name: org.name,
              legalName: org.legalName,
              gstin: org.gstin,
              address: org.address,
              settings: org.settings,
            }
          : null,
        after: data,
      });
      emit('settings.changed', { scope: 'organization' });
    });
    invalidateOrgSettings();
    return this.organization(actor);
  }
}
