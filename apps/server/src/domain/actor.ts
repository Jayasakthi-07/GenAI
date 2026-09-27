import { type Permission, type Role, roleCan } from '@stockroom/shared';
import { forbidden } from './errors';

/**
 * Who is performing an operation. Every service method receives one, so validation,
 * permissions and audit apply identically to people, agents, the simulator and the system.
 */
export type Actor =
  | { type: 'user'; userId: string; role: Role; name: string; ip?: string }
  | { type: 'agent'; agentKey: string; runId: string | null; onBehalfOf?: { userId: string; role: Role } }
  | { type: 'system'; reason: string }
  | { type: 'simulator' };

/** Agents act with Manager-level operational permissions, never admin ones; their actions are gated by autonomy. */
const AGENT_ROLE: Role = 'MANAGER';

export function actorRole(actor: Actor): Role | null {
  switch (actor.type) {
    case 'user':
      return actor.role;
    case 'agent':
      return actor.onBehalfOf?.role ?? AGENT_ROLE;
    case 'system':
    case 'simulator':
      return null;
  }
}

export function can(actor: Actor, permission: Permission): boolean {
  if (actor.type === 'system' || actor.type === 'simulator') return true;
  const role = actorRole(actor);
  return role !== null && roleCan(role, permission);
}

export function assertCan(actor: Actor, permission: Permission, message?: string): void {
  if (!can(actor, permission)) throw forbidden(message);
}

/** Fields written to ledger rows, audit entries and "created by" columns. */
export function actorColumns(actor: Actor) {
  switch (actor.type) {
    case 'user':
      return { actorType: 'USER', actorUserId: actor.userId, agentKey: null, agentRunId: null } as const;
    case 'agent':
      return {
        actorType: 'AGENT',
        actorUserId: actor.onBehalfOf?.userId ?? null,
        agentKey: actor.agentKey,
        agentRunId: actor.runId,
      } as const;
    case 'system':
      return { actorType: 'SYSTEM', actorUserId: null, agentKey: null, agentRunId: null } as const;
    case 'simulator':
      return { actorType: 'SIMULATOR', actorUserId: null, agentKey: null, agentRunId: null } as const;
  }
}

export const SYSTEM_ACTOR: Actor = { type: 'system', reason: 'internal' };
