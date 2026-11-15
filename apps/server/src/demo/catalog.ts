import type { FestiveGroup } from './calendar';

/**
 * Master data for the demo: a fictional FMCG distributor in Tamil Nadu that supplies stores across
 * the state from three warehouses. The products (see product-range.ts) are real, widely sold
 * supermarket brands at approximate MRPs; the company, its suppliers, customers, email domains and
 * tax numbers are invented.
 */

export const ORGANIZATION = {
  name: 'Kaveri Distributors',
  legalName: 'Kaveri Retail Distributors Pvt. Ltd.',
  gstin: '33AAHCK4821M1Z6',
  address: '41, Industrial Estate Road, Ambattur, Chennai 600058, Tamil Nadu',
};

export const DEMO_PASSWORD = 'stockroom2026';

/** The team. `key` is how the simulator refers to who did what. */
export const USERS = [
  { key: 'admin', email: 'jayasakthi@pmu.example', name: 'Jayasakthi', role: 'ADMIN' },
  { key: 'admin2', email: 'mehavardhini@pmu.example', name: 'Mehavardhini', role: 'ADMIN' },
  { key: 'manager', email: 'shafeer@pmu.example', name: 'Shafeer', role: 'MANAGER' },
  { key: 'staff', email: 'sameer@pmu.example', name: 'Sameer', role: 'STAFF' },
] as const;
export type DemoUserKey = (typeof USERS)[number]['key'];

export interface WarehouseDef {
  code: string;
  name: string;
  city: string;
  address: string;
  /** Share of network demand served from here. */
  share: number;
  isDefault: boolean;
}

export const WAREHOUSES: WarehouseDef[] = [
  {
    code: 'CHN',
    name: 'Chennai Central DC',
    city: 'Chennai',
    address: 'Plot 14, SIDCO Industrial Estate, Ambattur, Chennai 600098',
    share: 0.45,
    isDefault: true,
  },
  {
    code: 'CBE',
    name: 'Coimbatore DC',
    city: 'Coimbatore',
    address: '22, SIDCO Industrial Estate, Kurichi, Coimbatore 641021',
    share: 0.3,
    isDefault: false,
  },
  {
    code: 'MDU',
    name: 'Madurai DC',
    city: 'Madurai',
    address: '9, SIDCO Industrial Estate, Kappalur, Madurai 625008',
    share: 0.25,
    isDefault: false,
  },
];

export const UNITS = [
  { code: 'pcs', name: 'Piece' },
  { code: 'pack', name: 'Pack' },
  { code: 'bag', name: 'Bag' },
  { code: 'pouch', name: 'Pouch' },
  { code: 'bottle', name: 'Bottle' },
  { code: 'can', name: 'Can' },
  { code: 'tin', name: 'Tin' },
  { code: 'jar', name: 'Jar' },
  { code: 'box', name: 'Box' },
  { code: 'tub', name: 'Tub' },
  { code: 'tube', name: 'Tube' },
  { code: 'carton', name: 'Carton' },
];

export const REASON_CODES = [
  {
    code: 'DAMAGED',
    label: 'Damaged in storage or handling',
    direction: 'OUT',
    appliesTo: ['ADJUSTMENT', 'WRITE_OFF'],
  },
  { code: 'EXPIRED', label: 'Expired', direction: 'OUT', appliesTo: ['WRITE_OFF'] },
  {
    code: 'SHRINKAGE',
    label: 'Shrinkage / suspected theft',
    direction: 'OUT',
    appliesTo: ['ADJUSTMENT', 'WRITE_OFF'],
  },
  { code: 'FOUND', label: 'Found stock', direction: 'IN', appliesTo: ['ADJUSTMENT'] },
  { code: 'DATA_ENTRY', label: 'Data-entry correction', direction: 'BOTH', appliesTo: ['ADJUSTMENT'] },
  { code: 'CUSTOMER_RETURN', label: 'Customer return', direction: 'IN', appliesTo: ['RETURN'] },
  {
    code: 'QUALITY_REJECT',
    label: 'Rejected on quality inspection',
    direction: 'OUT',
    appliesTo: ['WRITE_OFF', 'ADJUSTMENT'],
  },
  { code: 'SAMPLE', label: 'Samples and promotions', direction: 'OUT', appliesTo: ['ADJUSTMENT', 'ISSUE'] },
  {
    code: 'COUNT_VARIANCE',
    label: 'Cycle-count variance',
    direction: 'BOTH',
    appliesTo: ['COUNT_CORRECTION'],
  },
  {
    code: 'INTERNAL_USE',
    label: 'Internal use (store, office, canteen)',
    direction: 'OUT',
    appliesTo: ['ISSUE'],
  },
] as const;

export interface SupplierDef {
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  gstin: string;
  paymentTermsDays: number;
  /** Probability a delivery arrives by the expected date. */
  onTime: number;
  /** Standard deviation of lead time in days. */
  leadTimeSd: number;
  /** Probability an order line is delivered in full. */
  fullFill: number;
  /** Fraction of delivered units rejected on inspection. */
  rejectRate: number;
  /** Annual price drift (0.06 = +6% a year). */
  priceTrend: number;
  /** Cost relative to the reference cost (alternate suppliers are dearer). */
  costFactor: number;
  /** Recent change in behaviour the Supplier Analyst should notice. */
  recent?: { days: number; onTime: number; extraDelay: [number, number] };
  notes?: string;
}

/** Tamil Nadu distributors and stockists for the brands in the range. */
export const SUPPLIERS: SupplierDef[] = [
  {
    code: 'VGT',
    name: 'Vaigai Grain Traders',
    contactName: 'R. Senthil Kumar',
    email: 'orders@vaigaigrain.example',
    phone: '+91 452 253 4410',
    city: 'Madurai',
    gstin: '33AAEFV3317K1Z2',
    paymentTermsDays: 30,
    onTime: 0.95,
    leadTimeSd: 0.8,
    fullFill: 0.97,
    rejectRate: 0.002,
    priceTrend: 0.05,
    costFactor: 1,
  },
  {
    code: 'TFA',
    name: 'Thamirabarani Food Agencies',
    contactName: 'K. Lakshmi Priya',
    email: 'supply@thamirabaranifoods.example',
    phone: '+91 462 257 7810',
    city: 'Tirunelveli',
    gstin: '33AADFT5528F1Z9',
    paymentTermsDays: 21,
    onTime: 0.86,
    leadTimeSd: 1.6,
    fullFill: 0.93,
    rejectRate: 0.004,
    priceTrend: 0.07,
    costFactor: 1,
  },
  {
    code: 'COF',
    name: 'Coromandel Oils & Fats',
    contactName: 'S. Arumugam',
    email: 'sales@coromandeloils.example',
    phone: '+91 44 2621 4478',
    city: 'Chennai',
    gstin: '33AACCC7751Q1Z4',
    paymentTermsDays: 30,
    onTime: 0.92,
    leadTimeSd: 1,
    fullFill: 0.95,
    rejectRate: 0.003,
    priceTrend: 0.09,
    costFactor: 1,
    recent: { days: 21, onTime: 0.45, extraDelay: [3, 8] },
  },
  {
    code: 'EST',
    name: 'Erode Spice Traders',
    contactName: 'P. Muthusamy',
    email: 'trade@erodespice.example',
    phone: '+91 424 225 6620',
    city: 'Erode',
    gstin: '33AAJFE2204H1Z1',
    paymentTermsDays: 15,
    onTime: 0.68,
    leadTimeSd: 3.5,
    fullFill: 0.84,
    rejectRate: 0.012,
    priceTrend: 0.16,
    costFactor: 1,
    notes: 'Frequent partial deliveries during harvest season.',
  },
  {
    code: 'CSD',
    name: 'Chola Snacks Distributors',
    contactName: 'S. Meenakshi',
    email: 'dispatch@cholasnacks.example',
    phone: '+91 4362 241 345',
    city: 'Thanjavur',
    gstin: '33AAKFC8813B1Z7',
    paymentTermsDays: 30,
    onTime: 0.88,
    leadTimeSd: 1.4,
    fullFill: 0.94,
    rejectRate: 0.005,
    priceTrend: 0.06,
    costFactor: 1,
  },
  {
    code: 'MBA',
    name: 'Marina Beverage Agencies',
    contactName: 'V. Karthikeyan',
    email: 'orders@marinabeverages.example',
    phone: '+91 44 2495 5512',
    city: 'Chennai',
    gstin: '33AAFFM6140P1Z3',
    paymentTermsDays: 30,
    onTime: 0.95,
    leadTimeSd: 0.9,
    fullFill: 0.97,
    rejectRate: 0.003,
    priceTrend: 0.05,
    costFactor: 1,
    recent: { days: 60, onTime: 0.5, extraDelay: [3, 10] },
    notes: 'Moved to a new warehouse in Sriperumbudur this quarter.',
  },
  {
    code: 'KDA',
    name: 'Kamadhenu Dairy Agencies',
    contactName: 'G. Kavitha',
    email: 'fresh@kamadhenudairy.example',
    phone: '+91 44 2658 1199',
    city: 'Chennai',
    gstin: '33AAAFK0917N1Z8',
    paymentTermsDays: 7,
    onTime: 0.98,
    leadTimeSd: 0.2,
    fullFill: 0.98,
    rejectRate: 0.004,
    priceTrend: 0.06,
    costFactor: 1,
  },
  {
    code: 'SBD',
    name: 'Sangam Bakery Distributors',
    contactName: 'J. Anthony Raj',
    email: 'orders@sangambakery.example',
    phone: '+91 44 2374 6671',
    city: 'Chennai',
    gstin: '33AAFFS3398L1Z5',
    paymentTermsDays: 14,
    onTime: 0.91,
    leadTimeSd: 0.5,
    fullFill: 0.95,
    rejectRate: 0.006,
    priceTrend: 0.05,
    costFactor: 1,
  },
  {
    code: 'PPC',
    name: 'Pandian Personal Care Agencies',
    contactName: 'M. Fathima Begum',
    email: 'b2b@pandiancare.example',
    phone: '+91 452 434 2256',
    city: 'Madurai',
    gstin: '33AAGFP5561D1Z0',
    paymentTermsDays: 45,
    onTime: 0.92,
    leadTimeSd: 1.5,
    fullFill: 0.96,
    rejectRate: 0.002,
    priceTrend: 0.04,
    costFactor: 1,
  },
  {
    code: 'KHC',
    name: 'Kovai Home Care Agencies',
    contactName: 'N. Manoj Kumar',
    email: 'orders@kovaihomecare.example',
    phone: '+91 422 431 8890',
    city: 'Coimbatore',
    gstin: '33AAICK2270E1Z6',
    paymentTermsDays: 30,
    onTime: 0.87,
    leadTimeSd: 1.8,
    fullFill: 0.9,
    rejectRate: 0.004,
    priceTrend: 0.05,
    costFactor: 1,
  },
  {
    code: 'RFA',
    name: 'Rockfort Food Agencies',
    contactName: 'T. Ilango',
    email: 'supply@rockfortfoods.example',
    phone: '+91 431 270 4403',
    city: 'Tiruchirappalli',
    gstin: '33AAEFR9982R1Z2',
    paymentTermsDays: 30,
    onTime: 0.76,
    leadTimeSd: 2.2,
    fullFill: 0.82,
    rejectRate: 0.008,
    priceTrend: 0.08,
    costFactor: 1,
  },
  {
    code: 'SWM',
    name: 'Sunrise Wholesale Mart',
    contactName: 'Deepa Krishnan',
    email: 'b2b@sunrisewholesale.example',
    phone: '+91 44 4859 2210',
    city: 'Chennai',
    gstin: '33AAMFS6605C1Z9',
    paymentTermsDays: 7,
    onTime: 0.93,
    leadTimeSd: 0.7,
    fullFill: 0.96,
    rejectRate: 0.003,
    priceTrend: 0.06,
    costFactor: 1.07,
    notes: 'Cash-and-carry wholesaler in Koyambedu; dearer but fast.',
  },
];

export type WeeklyProfile = 'retail' | 'staple' | 'fresh';

/** Sunday-first weekly demand shapes (mean ≈ 1). */
export const WEEKLY: Record<WeeklyProfile, number[]> = {
  retail: [1.12, 0.9, 0.9, 0.93, 0.96, 1.03, 1.16],
  staple: [0.72, 1.06, 1.03, 1.0, 1.0, 1.08, 1.11],
  fresh: [1.08, 0.95, 0.96, 0.97, 0.98, 1.0, 1.06],
};

export interface VariantDef {
  size: string;
  unit: string;
  /** Printed MRP in rupees; the distributor's price and cost are derived from it. */
  mrp: number;
  /** Average network demand (units/day). */
  v: number;
  pack?: number;
  moq?: number;
  /** Probability of any demand on a day (intermittent items). */
  p?: number;
  /** Not stocked in Madurai. */
  noMdu?: boolean;
}

export interface ItemDef {
  name: string;
  brand: string;
  variants: VariantDef[];
  groups?: FestiveGroup[];
  /** Annual demand growth (0.3 = +30%/year). */
  trend?: number;
  season?: 'summer' | 'winter';
  shelf?: number;
  desc?: string;
  tags?: string[];
}

export interface SubcategoryDef {
  name: string;
  code: string;
  items: ItemDef[];
}

export interface CategoryDef {
  name: string;
  slug: string;
  code: string;
  description: string;
  gst: number;
  /** The distributor's price to stores, as a discount off MRP. */
  discount: [number, number];
  /** The distributor's margin over its cost. */
  margin: [number, number];
  weekly: WeeklyProfile;
  supplier: string;
  alternates: string[];
  /** Batch/expiry tracked; shelf life in days unless overridden per item. */
  shelf?: number;
  groups?: FestiveGroup[];
  subcategories: SubcategoryDef[];
}
