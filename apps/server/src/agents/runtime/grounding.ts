/**
 * Whether a model-written sentence is anchored in the analysis it was given: it must name at
 * least one item from the facts (a product, warehouse, supplier, SKU, document number) or quote
 * one of their figures. Small local models sometimes write fluent text about nothing in
 * particular ("multiple components failing"); such text is replaced by the computed summary.
 */
export interface Anchors {
  names: Set<string>;
  numbers: Set<string>;
}

/** Keys whose string values identify something the reader can look up. */
const NAME_KEY = /name|code|sku|warehouse|supplier|product|category|customer|number|title|label/i;

export function anchorsOf(facts: unknown): Anchors {
  const names = new Set<string>();
  const numbers = new Set<string>();
  const visit = (v: unknown, key: string, depth: number) => {
    if (depth > 8 || names.size + numbers.size > 20_000) return;
    if (typeof v === 'number' && Number.isFinite(v)) {
      for (const n of numberForms(v)) numbers.add(n);
    } else if (typeof v === 'string') {
      const s = v.trim();
      if (NAME_KEY.test(key) && s.length >= 3 && s.length <= 80 && /[a-z]/i.test(s)) {
        names.add(s.toLowerCase());
        // Prose shortens long names ("Ponni Rice" for "Ponni Rice 5 kg").
        const words = s.split(/\s+/);
        const short = words.slice(0, 2).join(' ');
        if (words.length >= 3 && short.length >= 8) names.add(short.toLowerCase());
      }
      for (const m of s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) numbers.add(m.replace(/,/g, ''));
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x, key, depth + 1);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) visit(x, k, depth + 1);
    }
  };
  visit(facts, '', 0);
  return { names, numbers };
}

/** 3.14159 → "3.14159", "3", "3.1", "3.14"; 0.42 → also "42" (a share quoted as a percentage). */
function numberForms(n: number): string[] {
  const out = new Set([String(n), String(Math.round(n)), n.toFixed(1), n.toFixed(2)]);
  if (Math.abs(n) < 1 && n !== 0) out.add(String(Math.round(n * 100)));
  return [...out];
}

/** Numbers this small fit almost any sentence ("2 warehouses"), so they don't count. */
const TRIVIAL = new Set(['0', '1', '2', '3']);

export function isGrounded(text: string, anchors: Anchors): boolean {
  for (const m of text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const n = m.replace(/,/g, '');
    if (!TRIVIAL.has(n) && anchors.numbers.has(n)) return true;
  }
  const lower = text.toLowerCase();
  for (const name of anchors.names) if (lower.includes(name)) return true;
  return false;
}
