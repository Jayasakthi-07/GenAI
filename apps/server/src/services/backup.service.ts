import {
  AGENT_LABELS,
  type AgentDto,
  type ModelRefDto,
  type SettingsBackup,
  type SettingsImportResult,
  settingsImportSchema,
  type SettingsImport,
} from '@stockroom/shared';
import type { Db } from '../db/client';
import { type Actor, assertCan } from '../domain/actor';
import type { AgentService } from './agent.service';
import type { AiService } from './ai.service';
import type { SettingsService } from './settings.service';

type Change = SettingsImportResult['changes'][number];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const model = (m: ModelRefDto | null) => (m ? `${m.providerKey}/${m.modelId}` : 'the routing default');
const FIELDS = ['isEnabled', 'autonomy', 'systemPrompt', 'triggers', 'limits', 'modelOverride'] as const;
const fieldLabel: Record<(typeof FIELDS)[number], string> = {
  isEnabled: 'on/off',
  autonomy: 'autonomy',
  systemPrompt: 'prompt',
  triggers: 'schedule and triggers',
  limits: 'limits',
  modelOverride: 'model',
};

/**
 * Settings backup and restore: organization settings, agent configuration and model routing as
 * one JSON document. Restoring goes through the same services as the settings pages, so every
 * change is validated and audited.
 */
export class BackupService {
  constructor(
    private readonly prisma: Db,
    private readonly deps: { settings: SettingsService; agents: AgentService; ai: AiService },
  ) {}

  async export(actor: Actor): Promise<SettingsBackup> {
    assertCan(actor, 'organization.manage', 'Only admins can export settings.');
    const [org, agents, routing] = await Promise.all([
      this.deps.settings.organization(actor),
      this.deps.agents.list(actor),
      this.deps.ai.routing(actor),
    ]);
    return {
      format: 'stockroom.settings',
      version: 1,
      exportedAt: new Date().toISOString(),
      organization: {
        name: org.name,
        legalName: org.legalName,
        gstin: org.gstin,
        address: org.address,
        settings: org.settings,
      },
      agents: agents.filter((a) => !a.chatOnly).map((a) => this.agentEntry(a)),
      routing,
    };
  }

  private agentEntry(a: AgentDto): SettingsBackup['agents'][number] {
    return {
      key: a.key,
      isEnabled: a.isEnabled,
      autonomy: a.autonomy,
      systemPrompt: a.systemPrompt === a.defaultPrompt ? null : a.systemPrompt,
      triggers: a.triggers,
      limits: a.limits,
      modelOverride: a.modelOverride,
    };
  }

  /** Compares a backup with the current settings, and applies it when asked. */
  async import(actor: Actor, raw: SettingsImport): Promise<SettingsImportResult> {
    assertCan(actor, 'organization.manage', 'Only admins can restore settings.');
    const { backup, apply } = settingsImportSchema.parse(raw);
    const current = await this.export(actor);
    const changes: Change[] = [];

    const o = backup.organization;
    const co = current.organization;
    for (const k of ['name', 'legalName', 'gstin', 'address'] as const)
      if (o[k] !== co[k])
        changes.push({ section: 'organization', item: k, detail: `${co[k] ?? '—'} → ${o[k] ?? '—'}` });
    for (const [k, v] of Object.entries(o.settings)) {
      const was = (co.settings as Record<string, unknown>)[k];
      if (!same(v, was))
        changes.push({ section: 'organization', item: k, detail: `${String(was)} → ${String(v)}` });
    }

    const agentPatches: Array<{
      key: SettingsBackup['agents'][number]['key'];
      patch: Record<string, unknown>;
    }> = [];
    for (const a of backup.agents) {
      const was = current.agents.find((x) => x.key === a.key);
      if (!was) continue;
      const patch: Record<string, unknown> = {};
      for (const k of FIELDS) {
        if (same(a[k], was[k])) continue;
        patch[k] = a[k];
        const detail =
          k === 'isEnabled'
            ? a.isEnabled
              ? 'turned on'
              : 'turned off'
            : k === 'autonomy'
              ? `${was.autonomy.toLowerCase()} → ${a.autonomy.toLowerCase()}`
              : k === 'systemPrompt'
                ? a.systemPrompt === null
                  ? 'back to the built-in prompt'
                  : 'custom prompt'
                : k === 'modelOverride'
                  ? `${model(was.modelOverride)} → ${model(a.modelOverride)}`
                  : `${fieldLabel[k]} changed`;
        changes.push({ section: 'agents', item: AGENT_LABELS[a.key] ?? a.key, detail });
      }
      if (Object.keys(patch).length) agentPatches.push({ key: a.key, patch });
    }

    const routingChanged = !same(backup.routing, current.routing);
    if (routingChanged)
      changes.push({
        section: 'routing',
        item: 'Model routing',
        detail: `default ${model(current.routing.default)} → ${model(backup.routing.default)}`,
      });

    const enabled = new Set(
      (await this.prisma.providerConfig.findMany({ where: { isEnabled: true }, select: { key: true } })).map(
        (p) => p.key,
      ),
    );
    const refs = [
      backup.routing.default,
      ...backup.routing.fallbacks,
      ...Object.values(backup.routing.agentOverrides),
      ...backup.agents.map((a) => a.modelOverride),
    ].filter((m): m is ModelRefDto => m !== null);
    const warnings = [
      ...new Set(refs.filter((m) => !enabled.has(m.providerKey)).map((m) => m.providerKey)),
    ].map(
      (p) =>
        `The backup uses ${p}, which isn’t enabled here. Those agents fall back to other models until you set it up.`,
    );

    if (apply && changes.length) {
      if (changes.some((c) => c.section === 'organization'))
        await this.deps.settings.updateOrganization(actor, { ...o });
      for (const { key, patch } of agentPatches) await this.deps.agents.update(actor, key, patch);
      if (routingChanged) await this.deps.ai.saveRouting(actor, backup.routing);
    }
    return { applied: apply && changes.length > 0, changes, warnings };
  }
}
