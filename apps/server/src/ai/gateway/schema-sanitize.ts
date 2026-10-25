import type { JsonSchema } from './types';

type Flavor = 'openai' | 'gemini' | 'ollama';

const GEMINI_DROP = new Set([
  '$schema',
  '$id',
  'additionalProperties',
  'default',
  'examples',
  'title',
  'propertyNames',
  'patternProperties',
  'const',
  'unevaluatedProperties',
]);
const GEMINI_FORMATS = new Set(['date-time', 'enum']);
const COMMON_DROP = new Set(['$schema', '$id']);

/**
 * Makes a Zod-generated JSON Schema acceptable to a provider. Gemini's function declarations accept
 * a subset of JSON Schema: no $ref, no additionalProperties, anyOf instead of oneOf, limited formats.
 * OpenAI-compatible providers and Ollama accept most of it, but $ref is inlined for small models.
 */
export function sanitizeSchema(schema: JsonSchema, flavor: Flavor): JsonSchema {
  const defs = {
    ...((schema.$defs as Record<string, JsonSchema> | undefined) ?? {}),
    ...((schema.definitions as Record<string, JsonSchema> | undefined) ?? {}),
  };
  return walk(schema, flavor, defs, 0) as JsonSchema;
}

function walk(node: unknown, flavor: Flavor, defs: Record<string, JsonSchema>, depth: number): unknown {
  if (Array.isArray(node)) return node.map((n) => walk(n, flavor, defs, depth));
  if (!node || typeof node !== 'object') return node;
  if (depth > 20) return {};
  const obj = node as Record<string, unknown>;

  if (typeof obj.$ref === 'string') {
    const name = obj.$ref.split('/').pop() ?? '';
    const target = defs[name];
    return target ? walk(target, flavor, defs, depth + 1) : {};
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$defs' || key === 'definitions') continue;
    if (COMMON_DROP.has(key)) continue;
    if (flavor === 'gemini') {
      if (GEMINI_DROP.has(key)) continue;
      if (key === 'format' && typeof value === 'string' && !GEMINI_FORMATS.has(value)) continue;
      if (key === 'oneOf') {
        out.anyOf = walk(value, flavor, defs, depth + 1);
        continue;
      }
      if (key === 'type' && Array.isArray(value)) {
        // ["string","null"] → "string" + nullable
        const types = value.filter((t) => t !== 'null');
        out.type = types[0] ?? 'string';
        if (types.length !== value.length) out.nullable = true;
        continue;
      }
    }
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v, flavor, defs, depth + 1),
        ]),
      );
      continue;
    }
    out[key] = walk(value, flavor, defs, depth + 1);
  }

  if (flavor === 'gemini') {
    // Gemini rejects an `anyOf` mixing a null type; fold it into nullable.
    const any = out.anyOf as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(any)) {
      const nonNull = any.filter((s) => s.type !== 'null');
      if (nonNull.length === 1 && nonNull.length !== any.length) {
        delete out.anyOf;
        Object.assign(out, nonNull[0], { nullable: true });
      }
    }
    // Every object needs `properties`, even when empty.
    if (out.type === 'object' && !out.properties) out.properties = {};
  }
  return out;
}
