import { addDays, daysBetween, type FestiveGroup } from './calendar';
import {
  CATEGORIES,
  type CategoryDef,
  EXTRA_ITEMS,
  type ItemDef,
  PRIVATE_LABEL,
  SUPPLIERS,
  type SupplierDef,
  UNITS,
  WEEKLY,
} from './catalog';
import { ean13, hashString, type Rng } from './random';

export interface Promo {
  start: string;
  end: string;
  lift: number;
  discount: number;
}

export interface SupplierLink {
  supplier: SupplierDef;
  /** Current unit cost in paise. */
  costPaise: number;
  leadTimeDays: number;
  moq: number;
  packSize: number;
  supplierSku: string;
  preferred: boolean;
}

export interface ProductSpec {
  key: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: CategoryDef;
  subcategorySlug: string;
  brand: string;
  unitCode: string;
  costPaise: number;
  sellingPaise: number;
  mrpPaise: number;
  taxRate: number;
  trackExpiry: boolean;
  shelfLifeDays: number | null;
  leadTimeDays: number;
  /** Current average network demand (units/day). */
  v: number;
  /** Probability of any demand on a given day (intermittent items). */
  p: number | null;
  trend: number;
  season: 'summer' | 'winter' | null;
  groups: FestiveGroup[];
  weekly: number[];
  pack: number;
  moq: number;
  noHyd: boolean;
  wholesaleOnly: boolean;
  tags: string[];
  promos: Promo[];
  suppliers: SupplierLink[];
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const supplierByCode = new Map(SUPPLIERS.map((s) => [s.code, s]));
const unitNames = new Map(UNITS.map((u) => [u.code, u.name]));

/** Nominal lead time a supplier quotes for a product. */
function nominalLeadTime(code: string, shelf: number | null): number {
  switch (code) {
    case 'NGM':
      return 4;
    case 'DAF':
      return 6;
    case 'COF':
      return 5;
    case 'MST':
      return 8;
    case 'SSP':
      return 5;
    case 'GBV':
      return 4;
    case 'HDC':
      return 1;
    case 'KBK':
      return shelf !== null && shelf <= 14 ? 1 : 3;
    case 'VPC':
      return 7;
    case 'KHC':
      return 6;
    case 'TPF':
      return 7;
    case 'SWM':
      return shelf !== null && shelf <= 14 ? 1 : 2;
    default:
      return 5;
  }
}

/** Retail-style price rounding: whole rupees above ₹20, half rupees below. */
function roundPrice(paise: number): number {
  return paise >= 2000 ? Math.round(paise / 100) * 100 : Math.round(paise / 50) * 50;
}

function makePromos(rng: Rng, start: string, today: string): Promo[] {
  if (!rng.bool(0.24)) return [];
  const promos: Promo[] = [];
  const span = daysBetween(start, today) - 60;
  const count = rng.int(2, 4);
  for (let i = 0; i < count; i++) {
    const s = addDays(start, 30 + rng.int(0, span));
    const e = addDays(s, rng.int(6, 10));
    if (promos.some((p) => !(e < p.start || s > p.end))) continue;
    promos.push({ start: s, end: e, lift: rng.float(1.3, 1.7), discount: rng.float(0.08, 0.12) });
  }
  return promos.sort((a, b) => a.start.localeCompare(b.start));
}

export function buildProducts(rng: Rng, start: string, today: string): ProductSpec[] {
  const products: ProductSpec[] = [];
  const seenBarcodes = new Set<string>();
  const counters = new Map<string, number>();

  const add = (
    category: CategoryDef,
    subCode: string,
    subName: string,
    item: ItemDef,
    privateLabel: boolean,
  ) => {
    for (const variant of item.variants) {
      const r = rng.fork(`${item.brand}|${item.name}|${variant.size}`);
      const counterKey = `${category.code}-${subCode}`;
      const n = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, n);

      const shelf = item.shelf ?? category.shelf ?? null;
      const primaryCode = privateLabel ? 'SWM' : category.supplier;
      const alternates = privateLabel
        ? [category.supplier]
        : category.alternates.filter((code) => code !== primaryCode && (code === 'SWM' ? r.bool(0.7) : true));

      const costPaise = Math.round(variant.cost * 100);
      const margin = r.float(category.margin[0], category.margin[1]);
      const sellingPaise = roundPrice(costPaise * (1 + margin));
      const mrpPaise = Math.ceil((sellingPaise * r.float(1.05, 1.14)) / 100) * 100;

      const key = slugify(`${item.brand} ${item.name} ${variant.size}`);
      let barcodeSeed = hashString(key);
      let barcode = ean13(`890${String(barcodeSeed % 1_000_000_000).padStart(9, '0')}`);
      while (seenBarcodes.has(barcode)) {
        barcodeSeed = (barcodeSeed * 31 + 7) >>> 0;
        barcode = ean13(`890${String(barcodeSeed % 1_000_000_000).padStart(9, '0')}`);
      }
      seenBarcodes.add(barcode);

      const pack = variant.pack ?? 1;
      const moq = pack * (variant.v >= 20 ? 2 : 1);
      const wholesaleOnly = /25 kg|15 L/.test(variant.size);
      const groups = [...new Set([...(category.groups ?? []), ...(item.groups ?? [])])];
      const tags = [
        ...(shelf !== null ? ['perishable'] : []),
        ...(privateLabel ? ['private-label'] : []),
        ...(variant.v >= 30 ? ['fast-mover'] : []),
        ...(wholesaleOnly ? ['wholesale-pack'] : []),
        ...(groups.some((g) => g === 'gifting' || g === 'dry_fruits' || g === 'puja') ? ['festive'] : []),
        ...((item.trend ?? 0) >= 0.2 ? ['trending'] : []),
      ];

      const primary = supplierByCode.get(primaryCode);
      if (!primary) throw new Error(`Unknown supplier ${primaryCode}`);
      const links: SupplierLink[] = [
        primary,
        ...alternates.map((c) => supplierByCode.get(c)).filter((s) => !!s),
      ].map((supplier, i) => {
        const altFactor = i === 0 ? 1 : supplier.code === 'SWM' ? 1 : r.float(1.01, 1.05);
        return {
          supplier,
          costPaise: Math.round(costPaise * supplier.costFactor * altFactor),
          leadTimeDays: nominalLeadTime(supplier.code, shelf),
          moq: i === 0 ? moq : pack,
          packSize: pack,
          supplierSku: `${supplier.code}-${String(hashString(`${supplier.code}${key}`) % 100000).padStart(5, '0')}`,
          preferred: i === 0,
        };
      });

      const unitName = unitNames.get(variant.unit) ?? variant.unit;
      const brand = privateLabel ? 'Kaveri Select' : item.brand;
      products.push({
        key,
        sku: `${category.code}-${subCode}-${String(n).padStart(3, '0')}`,
        barcode,
        name: `${brand} ${item.name} ${variant.size}`,
        description:
          item.desc ??
          `${item.name} from ${brand}, ${variant.size} ${unitName.toLowerCase()}.` +
            (privateLabel ? ' Kaveri house brand.' : '') +
            (shelf !== null ? ` Shelf life ${shelf} days.` : ''),
        category,
        subcategorySlug: `${category.slug}-${slugify(subName)}`,
        brand,
        unitCode: variant.unit,
        costPaise: links[0]?.costPaise ?? costPaise,
        sellingPaise,
        mrpPaise,
        taxRate: category.gst,
        trackExpiry: shelf !== null,
        shelfLifeDays: shelf,
        leadTimeDays: links[0]?.leadTimeDays ?? 5,
        v: variant.v,
        p: variant.p ?? null,
        trend: item.trend ?? 0,
        season: item.season ?? null,
        groups,
        weekly: WEEKLY[category.weekly],
        pack,
        moq,
        noHyd: variant.noHyd ?? false,
        wholesaleOnly,
        tags,
        promos: makePromos(r, start, today),
        suppliers: links,
      });
    }
  };

  const extrasBySub = new Map<string, ItemDef[]>();
  for (const extra of EXTRA_ITEMS) {
    const k = `${extra.category}|${extra.sub}`;
    extrasBySub.set(k, [...(extrasBySub.get(k) ?? []), extra.item]);
  }

  for (const category of CATEGORIES) {
    for (const sub of category.subcategories) {
      for (const item of [...sub.items, ...(extrasBySub.get(`${category.slug}|${sub.code}`) ?? [])]) {
        add(category, sub.code, sub.name, item, false);
      }
    }
  }
  for (const pl of PRIVATE_LABEL) {
    const category = CATEGORIES.find((c) => c.slug === pl.category);
    const sub = category?.subcategories.find((s) => s.code === pl.sub);
    if (!category || !sub) throw new Error(`Unknown private-label category ${pl.category}/${pl.sub}`);
    add(
      category,
      sub.code,
      sub.name,
      {
        name: pl.name,
        brand: 'Kaveri Select',
        variants: [{ size: pl.size, unit: pl.unit, cost: pl.cost, v: pl.v, pack: pl.pack }],
      },
      true,
    );
  }
  return products;
}
