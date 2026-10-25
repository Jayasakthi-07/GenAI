import type { FestiveGroup } from './calendar';

/**
 * Master data for the demo: a fictional South-Indian FMCG distributor.
 * Every company, brand, person, email domain and tax number here is invented.
 */

export const ORGANIZATION = {
  name: 'Kaveri Distributors',
  legalName: 'Kaveri Retail Distributors Pvt. Ltd.',
  gstin: '33AAHCK4821M1Z6',
  address: '41, Industrial Estate Road, Ambattur, Chennai 600058, Tamil Nadu',
};

export const DEMO_PASSWORD = 'stockroom2026';

export const USERS = [
  { email: 'admin@kaveri.example', name: 'Ananya Rao', role: 'ADMIN' },
  { email: 'manager@kaveri.example', name: 'Vikram Iyer', role: 'MANAGER' },
  { email: 'staff@kaveri.example', name: 'Priya Nair', role: 'STAFF' },
] as const;

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
    share: 0.42,
    isDefault: true,
  },
  {
    code: 'BLR',
    name: 'Bengaluru North DC',
    city: 'Bengaluru',
    address: '112, Peenya Industrial Area Phase 2, Bengaluru 560058',
    share: 0.35,
    isDefault: false,
  },
  {
    code: 'HYD',
    name: 'Hyderabad Hub',
    city: 'Hyderabad',
    address: '7-2-31, Kukatpally Industrial Estate, Hyderabad 500072',
    share: 0.23,
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

export const SUPPLIERS: SupplierDef[] = [
  {
    code: 'NGM',
    name: 'Narmada Grain Mills',
    contactName: 'Suresh Patil',
    email: 'orders@narmadagrain.example',
    phone: '+91 20 4410 2231',
    city: 'Pune',
    gstin: '27AAECN3317K1Z2',
    paymentTermsDays: 30,
    onTime: 0.95,
    leadTimeSd: 0.8,
    fullFill: 0.97,
    rejectRate: 0.002,
    priceTrend: 0.05,
    costFactor: 1,
  },
  {
    code: 'DAF',
    name: 'Deccan Agro Foods',
    contactName: 'Lakshmi Reddy',
    email: 'supply@deccanagro.example',
    phone: '+91 40 2355 7810',
    city: 'Hyderabad',
    gstin: '36AADCD5528F1Z9',
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
    contactName: 'Arjun Menon',
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
    code: 'MST',
    name: 'Malabar Spice Traders',
    contactName: 'Faisal Rahman',
    email: 'trade@malabarspice.example',
    phone: '+91 484 239 6620',
    city: 'Kochi',
    gstin: '32AAJFM2204H1Z1',
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
    code: 'SSP',
    name: 'Sahyadri Snacks Pvt. Ltd.',
    contactName: 'Meera Kulkarni',
    email: 'dispatch@sahyadrisnacks.example',
    phone: '+91 22 6718 3345',
    city: 'Mumbai',
    gstin: '27AAKCS8813B1Z7',
    paymentTermsDays: 30,
    onTime: 0.88,
    leadTimeSd: 1.4,
    fullFill: 0.94,
    rejectRate: 0.005,
    priceTrend: 0.06,
    costFactor: 1,
  },
  {
    code: 'GBV',
    name: 'Godavari Beverages',
    contactName: 'Ravi Varma',
    email: 'orders@godavaribev.example',
    phone: '+91 891 274 5512',
    city: 'Visakhapatnam',
    gstin: '37AAFCG6140P1Z3',
    paymentTermsDays: 30,
    onTime: 0.95,
    leadTimeSd: 0.9,
    fullFill: 0.97,
    rejectRate: 0.003,
    priceTrend: 0.05,
    costFactor: 1,
    recent: { days: 60, onTime: 0.5, extraDelay: [3, 10] },
    notes: 'Moved to a new bottling plant this quarter.',
  },
  {
    code: 'HDC',
    name: 'Himgiri Dairy Cooperative',
    contactName: 'Kavitha Gowda',
    email: 'fresh@himgiridairy.example',
    phone: '+91 80 2840 1199',
    city: 'Bengaluru',
    gstin: '29AAAAH0917N1Z8',
    paymentTermsDays: 7,
    onTime: 0.98,
    leadTimeSd: 0.2,
    fullFill: 0.98,
    rejectRate: 0.004,
    priceTrend: 0.06,
    costFactor: 1,
  },
  {
    code: 'KBK',
    name: 'Konkan Bakers',
    contactName: 'Joseph D’Souza',
    email: 'orders@konkanbakers.example',
    phone: '+91 832 245 6671',
    city: 'Goa',
    gstin: '30AAFCK3398L1Z5',
    paymentTermsDays: 14,
    onTime: 0.91,
    leadTimeSd: 0.5,
    fullFill: 0.95,
    rejectRate: 0.006,
    priceTrend: 0.05,
    costFactor: 1,
  },
  {
    code: 'VPC',
    name: 'Vindhya Personal Care',
    contactName: 'Neha Agarwal',
    email: 'b2b@vindhyacare.example',
    phone: '+91 731 408 2256',
    city: 'Indore',
    gstin: '23AAGCV5561D1Z0',
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
    name: 'Kaveri Home Care',
    contactName: 'Manoj Pillai',
    email: 'orders@kaverihomecare.example',
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
    code: 'TPF',
    name: 'Tapti Packaged Foods',
    contactName: 'Harish Shah',
    email: 'supply@taptifoods.example',
    phone: '+91 261 299 4403',
    city: 'Surat',
    gstin: '24AAECT9982R1Z2',
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
    notes: 'Cash-and-carry wholesaler; dearer but fast.',
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
  cost: number;
  /** Average network demand (units/day). */
  v: number;
  pack?: number;
  moq?: number;
  /** Probability of any demand on a day (intermittent items). */
  p?: number;
  /** Not stocked in Hyderabad. */
  noHyd?: boolean;
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
  margin: [number, number];
  weekly: WeeklyProfile;
  supplier: string;
  alternates: string[];
  /** Batch/expiry tracked; shelf life in days unless overridden per item. */
  shelf?: number;
  groups?: FestiveGroup[];
  subcategories: SubcategoryDef[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    name: 'Staples & Grains',
    slug: 'staples',
    code: 'STP',
    gst: 5,
    margin: [0.06, 0.1],
    weekly: 'staple',
    description: 'Rice, flours, pulses, sugar and salt.',
    supplier: 'NGM',
    alternates: ['DAF', 'SWM'],
    subcategories: [
      {
        name: 'Rice',
        code: 'RIC',
        items: [
          {
            name: 'Sona Masoori Rice',
            brand: 'Annapurna Harvest',
            groups: ['rice_jaggery'],
            variants: [
              { size: '5 kg', unit: 'bag', cost: 290, v: 70, pack: 5 },
              { size: '25 kg', unit: 'bag', cost: 1350, v: 9, p: 0.55 },
              { size: '1 kg', unit: 'pack', cost: 62, v: 40, pack: 10 },
            ],
          },
          {
            name: 'Basmati Rice',
            brand: 'Kesar Farms',
            groups: ['vermicelli'],
            trend: 0.18,
            variants: [
              { size: '1 kg', unit: 'pack', cost: 118, v: 26, pack: 10 },
              { size: '5 kg', unit: 'bag', cost: 560, v: 11, pack: 4 },
            ],
          },
          {
            name: 'Ponni Boiled Rice',
            brand: 'Annapurna Harvest',
            variants: [{ size: '10 kg', unit: 'bag', cost: 520, v: 16, pack: 2, noHyd: true }],
          },
          {
            name: 'Idli Rice',
            brand: 'Sunmill',
            variants: [{ size: '5 kg', unit: 'bag', cost: 232, v: 13, pack: 4 }],
          },
        ],
      },
      {
        name: 'Flours',
        code: 'FLR',
        items: [
          {
            name: 'Whole Wheat Atta',
            brand: 'Sunmill',
            variants: [
              { size: '5 kg', unit: 'bag', cost: 212, v: 48, pack: 4 },
              { size: '10 kg', unit: 'bag', cost: 405, v: 17, pack: 2 },
            ],
          },
          {
            name: 'Maida',
            brand: 'Sunmill',
            variants: [{ size: '1 kg', unit: 'pack', cost: 42, v: 21, pack: 10 }],
          },
          {
            name: 'Besan',
            brand: 'Desi Kitchen',
            groups: ['sweets_snacks'],
            variants: [
              { size: '500 g', unit: 'pack', cost: 56, v: 14, pack: 12 },
              { size: '1 kg', unit: 'pack', cost: 104, v: 9, pack: 10 },
            ],
          },
          {
            name: 'Bombay Rava',
            brand: 'Sunmill',
            variants: [{ size: '1 kg', unit: 'pack', cost: 48, v: 19, pack: 10 }],
          },
          {
            name: 'Ragi Flour',
            brand: 'Desi Kitchen',
            trend: 0.25,
            variants: [{ size: '1 kg', unit: 'pack', cost: 61, v: 8, pack: 10 }],
          },
        ],
      },
      {
        name: 'Pulses',
        code: 'PLS',
        items: [
          {
            name: 'Toor Dal',
            brand: 'Annapurna Harvest',
            variants: [
              { size: '1 kg', unit: 'pack', cost: 146, v: 44, pack: 10 },
              { size: '5 kg', unit: 'bag', cost: 705, v: 7, pack: 2 },
            ],
          },
          {
            name: 'Moong Dal',
            brand: 'Annapurna Harvest',
            variants: [{ size: '1 kg', unit: 'pack', cost: 126, v: 18, pack: 10 }],
          },
          {
            name: 'Chana Dal',
            brand: 'Annapurna Harvest',
            variants: [{ size: '1 kg', unit: 'pack', cost: 92, v: 17, pack: 10 }],
          },
          {
            name: 'Urad Dal',
            brand: 'Annapurna Harvest',
            variants: [{ size: '1 kg', unit: 'pack', cost: 128, v: 22, pack: 10 }],
          },
          {
            name: 'Masoor Dal',
            brand: 'Desi Kitchen',
            variants: [{ size: '1 kg', unit: 'pack', cost: 98, v: 8, pack: 10 }],
          },
          {
            name: 'Rajma',
            brand: 'Desi Kitchen',
            variants: [{ size: '500 g', unit: 'pack', cost: 84, v: 6, pack: 12 }],
          },
          {
            name: 'Kabuli Chana',
            brand: 'Desi Kitchen',
            variants: [{ size: '1 kg', unit: 'pack', cost: 118, v: 7, pack: 10 }],
          },
        ],
      },
      {
        name: 'Sugar & Salt',
        code: 'SGR',
        items: [
          {
            name: 'Refined Sugar',
            brand: 'Sunmill',
            groups: ['sweets_snacks'],
            variants: [
              { size: '1 kg', unit: 'pack', cost: 42, v: 55, pack: 10 },
              { size: '5 kg', unit: 'bag', cost: 205, v: 12, pack: 4 },
            ],
          },
          {
            name: 'Iodised Salt',
            brand: 'Sunmill',
            variants: [{ size: '1 kg', unit: 'pack', cost: 20, v: 46, pack: 25 }],
          },
          {
            name: 'Organic Jaggery',
            brand: 'Desi Kitchen',
            groups: ['rice_jaggery'],
            variants: [{ size: '1 kg', unit: 'pack', cost: 66, v: 9, pack: 10 }],
          },
          {
            name: 'Rock Salt',
            brand: 'Desi Kitchen',
            variants: [{ size: '500 g', unit: 'pack', cost: 38, v: 1.4, pack: 12, p: 0.4 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Edible Oils & Ghee',
    slug: 'oils-ghee',
    code: 'OIL',
    gst: 5,
    margin: [0.07, 0.12],
    weekly: 'staple',
    description: 'Cooking oils, ghee and vanaspati.',
    supplier: 'COF',
    alternates: ['SWM'],
    groups: ['oils'],
    subcategories: [
      {
        name: 'Cooking Oils',
        code: 'OIL',
        items: [
          {
            name: 'Sunflower Oil',
            brand: 'Malabar Coast',
            variants: [
              { size: '1 L pouch', unit: 'pouch', cost: 134, v: 58, pack: 10 },
              { size: '5 L', unit: 'can', cost: 648, v: 12, pack: 4 },
              { size: '15 L', unit: 'tin', cost: 1890, v: 2.5, p: 0.45 },
            ],
          },
          {
            name: 'Groundnut Oil',
            brand: 'Malabar Coast',
            variants: [
              { size: '1 L', unit: 'bottle', cost: 176, v: 21, pack: 12 },
              { size: '5 L', unit: 'can', cost: 845, v: 5, pack: 4 },
            ],
          },
          {
            name: 'Mustard Oil',
            brand: 'Kesar Farms',
            variants: [{ size: '1 L', unit: 'bottle', cost: 158, v: 5, pack: 12 }],
          },
          {
            name: 'Rice Bran Oil',
            brand: 'Malabar Coast',
            trend: 0.2,
            variants: [{ size: '1 L', unit: 'pouch', cost: 142, v: 12, pack: 10 }],
          },
          {
            name: 'Gingelly Oil',
            brand: 'Malabar Coast',
            groups: ['puja'],
            variants: [
              { size: '500 ml', unit: 'bottle', cost: 162, v: 9, pack: 12 },
              { size: '1 L', unit: 'bottle', cost: 312, v: 4, pack: 12 },
            ],
          },
          {
            name: 'Coconut Oil',
            brand: 'Malabar Coast',
            groups: ['coconut'],
            variants: [
              { size: '500 ml', unit: 'bottle', cost: 124, v: 15, pack: 12 },
              { size: '1 L', unit: 'bottle', cost: 238, v: 7, pack: 12 },
            ],
          },
        ],
      },
      {
        name: 'Ghee & Vanaspati',
        code: 'GHE',
        items: [
          {
            name: 'Pure Cow Ghee',
            brand: 'Himgiri',
            groups: ['ghee', 'sweets_snacks'],
            variants: [
              { size: '500 ml', unit: 'jar', cost: 312, v: 13, pack: 12 },
              { size: '1 L', unit: 'jar', cost: 598, v: 9, pack: 6 },
            ],
          },
          {
            name: 'Buffalo Ghee',
            brand: 'Himgiri',
            groups: ['ghee'],
            variants: [{ size: '1 L', unit: 'jar', cost: 560, v: 1.6, pack: 6, p: 0.45, noHyd: true }],
          },
          {
            name: 'Vanaspati',
            brand: 'Malabar Coast',
            groups: ['sweets_snacks'],
            trend: -0.15,
            variants: [{ size: '1 kg', unit: 'pack', cost: 144, v: 5, pack: 10 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Spices & Masalas',
    slug: 'spices',
    code: 'SPC',
    gst: 5,
    margin: [0.18, 0.26],
    weekly: 'retail',
    description: 'Ground and whole spices, blended masalas.',
    supplier: 'MST',
    alternates: ['DAF', 'SWM'],
    subcategories: [
      {
        name: 'Ground & Whole Spices',
        code: 'SPC',
        items: [
          {
            name: 'Turmeric Powder',
            brand: 'Aarogya',
            variants: [
              { size: '200 g', unit: 'pack', cost: 48, v: 22, pack: 20 },
              { size: '500 g', unit: 'pack', cost: 110, v: 7, pack: 12 },
            ],
          },
          {
            name: 'Red Chilli Powder',
            brand: 'Aarogya',
            variants: [
              { size: '200 g', unit: 'pack', cost: 62, v: 20, pack: 20 },
              { size: '500 g', unit: 'pack', cost: 146, v: 6, pack: 12 },
            ],
          },
          {
            name: 'Coriander Powder',
            brand: 'Aarogya',
            variants: [{ size: '200 g', unit: 'pack', cost: 40, v: 15, pack: 20 }],
          },
          {
            name: 'Cumin Seeds',
            brand: 'Aarogya',
            variants: [
              { size: '100 g', unit: 'pack', cost: 58, v: 12, pack: 20 },
              { size: '200 g', unit: 'pack', cost: 110, v: 5, pack: 20 },
            ],
          },
          {
            name: 'Mustard Seeds',
            brand: 'Aarogya',
            variants: [{ size: '200 g', unit: 'pack', cost: 32, v: 10, pack: 20 }],
          },
          {
            name: 'Black Pepper',
            brand: 'Malabar Coast',
            variants: [{ size: '100 g', unit: 'pack', cost: 96, v: 7, pack: 20 }],
          },
          {
            name: 'Green Cardamom',
            brand: 'Malabar Coast',
            groups: ['sweets_snacks'],
            variants: [{ size: '50 g', unit: 'pack', cost: 182, v: 4, pack: 20 }],
          },
          {
            name: 'Cloves',
            brand: 'Malabar Coast',
            variants: [{ size: '50 g', unit: 'pack', cost: 86, v: 2.4, pack: 20, p: 0.6 }],
          },
        ],
      },
      {
        name: 'Blended Masalas',
        code: 'MSL',
        items: [
          {
            name: 'Garam Masala',
            brand: 'Desi Kitchen',
            variants: [{ size: '100 g', unit: 'box', cost: 62, v: 11, pack: 24 }],
          },
          {
            name: 'Sambar Powder',
            brand: 'Desi Kitchen',
            variants: [{ size: '200 g', unit: 'pack', cost: 70, v: 17, pack: 20, noHyd: false }],
          },
          {
            name: 'Rasam Powder',
            brand: 'Desi Kitchen',
            variants: [{ size: '100 g', unit: 'pack', cost: 42, v: 9, pack: 24 }],
          },
          {
            name: 'Chicken Masala',
            brand: 'Desi Kitchen',
            variants: [{ size: '100 g', unit: 'box', cost: 58, v: 9, pack: 24 }],
          },
          {
            name: 'Chole Masala',
            brand: 'Desi Kitchen',
            variants: [{ size: '100 g', unit: 'box', cost: 55, v: 4, pack: 24 }],
          },
          {
            name: 'Biryani Masala',
            brand: 'Desi Kitchen',
            groups: ['vermicelli'],
            variants: [{ size: '50 g', unit: 'box', cost: 45, v: 8, pack: 24 }],
          },
          {
            name: 'Pav Bhaji Masala',
            brand: 'Desi Kitchen',
            variants: [{ size: '100 g', unit: 'box', cost: 52, v: 3, pack: 24 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Snacks & Sweets',
    slug: 'snacks',
    code: 'SNK',
    gst: 12,
    margin: [0.18, 0.25],
    weekly: 'retail',
    shelf: 150,
    description: 'Namkeen, chips, sweets and dry fruits.',
    supplier: 'SSP',
    alternates: ['SWM'],
    groups: ['sweets_snacks'],
    subcategories: [
      {
        name: 'Namkeen',
        code: 'NMK',
        items: [
          {
            name: 'Aloo Bhujia',
            brand: 'Crispo',
            variants: [
              { size: '200 g', unit: 'pack', cost: 42, v: 26, pack: 24 },
              { size: '1 kg', unit: 'pack', cost: 188, v: 4, pack: 10 },
            ],
          },
          {
            name: 'Madras Mixture',
            brand: 'Crispo',
            groups: ['coconut'],
            variants: [{ size: '400 g', unit: 'pack', cost: 74, v: 14, pack: 20 }],
          },
          {
            name: 'Moong Dal Namkeen',
            brand: 'Crispo',
            variants: [{ size: '200 g', unit: 'pack', cost: 40, v: 9, pack: 24 }],
          },
          {
            name: 'Khatta Meetha',
            brand: 'Crispo',
            variants: [{ size: '200 g', unit: 'pack', cost: 40, v: 7, pack: 24 }],
          },
        ],
      },
      {
        name: 'Chips & Nuts',
        code: 'CHP',
        items: [
          {
            name: 'Potato Chips Classic Salted',
            brand: 'Crispo',
            shelf: 120,
            variants: [
              { size: '52 g', unit: 'pack', cost: 16, v: 62, pack: 48 },
              { size: '90 g', unit: 'pack', cost: 28, v: 24, pack: 36 },
            ],
          },
          {
            name: 'Kerala Banana Chips',
            brand: 'Malabar Coast',
            groups: ['coconut'],
            shelf: 90,
            variants: [{ size: '200 g', unit: 'pack', cost: 60, v: 10, pack: 24 }],
          },
          {
            name: 'Masala Peanuts',
            brand: 'Crispo',
            variants: [{ size: '200 g', unit: 'pack', cost: 38, v: 11, pack: 24 }],
          },
        ],
      },
      {
        name: 'Sweets & Dry Fruits',
        code: 'DRY',
        items: [
          {
            name: 'Soan Papdi',
            brand: 'Kesar Farms',
            groups: ['gifting'],
            shelf: 120,
            variants: [{ size: '500 g', unit: 'box', cost: 96, v: 3, pack: 12 }],
          },
          {
            name: 'Cashews W320',
            brand: 'Kesar Farms',
            groups: ['dry_fruits'],
            shelf: 240,
            variants: [{ size: '250 g', unit: 'pack', cost: 232, v: 8, pack: 12 }],
          },
          {
            name: 'California Almonds',
            brand: 'Kesar Farms',
            groups: ['dry_fruits'],
            shelf: 300,
            variants: [{ size: '250 g', unit: 'pack', cost: 212, v: 7, pack: 12 }],
          },
          {
            name: 'Golden Raisins',
            brand: 'Kesar Farms',
            groups: ['dry_fruits'],
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', cost: 84, v: 5, pack: 12 }],
          },
          {
            name: 'Dry Fruit Gift Box',
            brand: 'Kesar Farms',
            groups: ['gifting'],
            shelf: 240,
            variants: [{ size: '500 g', unit: 'box', cost: 620, v: 0.3, pack: 6, p: 0.2 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Beverages',
    slug: 'beverages',
    code: 'BEV',
    gst: 12,
    margin: [0.1, 0.18],
    weekly: 'retail',
    description: 'Tea, coffee, juices, soft drinks and water.',
    supplier: 'GBV',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Tea & Coffee',
        code: 'TEA',
        items: [
          {
            name: 'Assam CTC Tea',
            brand: 'Chai Bagan',
            season: 'winter',
            variants: [
              { size: '250 g', unit: 'pack', cost: 114, v: 22, pack: 24 },
              { size: '1 kg', unit: 'pack', cost: 428, v: 6, pack: 10 },
            ],
          },
          {
            name: 'Green Tea',
            brand: 'Chai Bagan',
            trend: 0.3,
            variants: [{ size: '25 bags', unit: 'box', cost: 108, v: 5, pack: 24 }],
          },
          {
            name: 'Filter Coffee Powder',
            brand: 'Nilgiri Estates',
            season: 'winter',
            variants: [{ size: '500 g', unit: 'pack', cost: 246, v: 14, pack: 12 }],
          },
          {
            name: 'Instant Coffee',
            brand: 'Nilgiri Estates',
            variants: [{ size: '100 g', unit: 'jar', cost: 288, v: 6, pack: 12 }],
          },
        ],
      },
      {
        name: 'Juices & Soft Drinks',
        code: 'JUI',
        items: [
          {
            name: 'Mango Drink',
            brand: 'Godavari',
            season: 'summer',
            shelf: 180,
            variants: [
              { size: '600 ml', unit: 'bottle', cost: 31, v: 34, pack: 24 },
              { size: '1.2 L', unit: 'bottle', cost: 58, v: 12, pack: 12 },
            ],
          },
          {
            name: 'Mixed Fruit Juice',
            brand: 'Godavari',
            season: 'summer',
            shelf: 180,
            variants: [{ size: '1 L', unit: 'carton', cost: 94, v: 9, pack: 12 }],
          },
          {
            name: 'Lemon Soda',
            brand: 'Godavari',
            season: 'summer',
            shelf: 240,
            variants: [{ size: '750 ml', unit: 'bottle', cost: 27, v: 15, pack: 24 }],
          },
          {
            name: 'Cola',
            brand: 'Fizzup',
            season: 'summer',
            shelf: 240,
            variants: [{ size: '2 L', unit: 'bottle', cost: 74, v: 17, pack: 9 }],
          },
          {
            name: 'Packaged Drinking Water',
            brand: 'Nilgiri Springs',
            season: 'summer',
            variants: [
              { size: '1 L', unit: 'bottle', cost: 11, v: 90, pack: 12 },
              { size: '20 L', unit: 'can', cost: 58, v: 21, pack: 1 },
            ],
          },
        ],
      },
      {
        name: 'Health Drinks',
        code: 'HLT',
        items: [
          {
            name: 'Malt Health Drink',
            brand: 'Aarogya',
            trend: -0.12,
            variants: [{ size: '500 g', unit: 'jar', cost: 212, v: 7, pack: 12 }],
          },
          {
            name: 'Badam Drink Mix',
            brand: 'Aarogya',
            variants: [{ size: '200 g', unit: 'jar', cost: 138, v: 3, pack: 12 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Dairy & Chilled',
    slug: 'dairy',
    code: 'DAI',
    gst: 5,
    margin: [0.07, 0.12],
    weekly: 'fresh',
    shelf: 10,
    description: 'Milk, curd, paneer, butter, cheese and frozen foods.',
    supplier: 'HDC',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Milk & Curd',
        code: 'MLK',
        items: [
          {
            name: 'Toned Milk',
            brand: 'Himgiri',
            shelf: 3,
            variants: [{ size: '500 ml', unit: 'pouch', cost: 26, v: 160, pack: 20 }],
          },
          {
            name: 'Full Cream Milk',
            brand: 'Himgiri',
            shelf: 3,
            variants: [{ size: '1 L', unit: 'pouch', cost: 62, v: 48, pack: 12 }],
          },
          {
            name: 'Fresh Curd',
            brand: 'Himgiri',
            shelf: 10,
            variants: [{ size: '400 g', unit: 'tub', cost: 30, v: 42, pack: 12 }],
          },
          {
            name: 'Spiced Buttermilk',
            brand: 'Himgiri',
            season: 'summer',
            shelf: 7,
            variants: [{ size: '200 ml', unit: 'pouch', cost: 11, v: 38, pack: 30 }],
          },
        ],
      },
      {
        name: 'Butter, Cheese & Paneer',
        code: 'CHS',
        items: [
          {
            name: 'Salted Butter',
            brand: 'Himgiri',
            groups: ['bakery'],
            shelf: 180,
            variants: [
              { size: '100 g', unit: 'pack', cost: 52, v: 19, pack: 20 },
              { size: '500 g', unit: 'pack', cost: 248, v: 5, pack: 10 },
            ],
          },
          {
            name: 'Cheese Slices',
            brand: 'Himgiri',
            shelf: 180,
            trend: 0.15,
            variants: [{ size: '200 g', unit: 'pack', cost: 114, v: 7, pack: 12 }],
          },
          {
            name: 'Fresh Paneer',
            brand: 'Himgiri',
            shelf: 12,
            variants: [{ size: '200 g', unit: 'pack', cost: 82, v: 16, pack: 10 }],
          },
          {
            name: 'Fresh Cream',
            brand: 'Himgiri',
            groups: ['sweets_snacks'],
            shelf: 60,
            variants: [{ size: '200 ml', unit: 'carton', cost: 60, v: 5, pack: 12 }],
          },
        ],
      },
      {
        name: 'Frozen',
        code: 'FRZ',
        items: [
          {
            name: 'Frozen Green Peas',
            brand: 'Himgiri',
            shelf: 365,
            variants: [{ size: '500 g', unit: 'pack', cost: 84, v: 6, pack: 12, noHyd: true }],
          },
          {
            name: 'Vanilla Ice Cream',
            brand: 'Himgiri',
            season: 'summer',
            shelf: 270,
            variants: [{ size: '1 L', unit: 'tub', cost: 148, v: 7, pack: 6 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Bakery & Breakfast',
    slug: 'bakery',
    code: 'BKR',
    gst: 18,
    margin: [0.12, 0.18],
    weekly: 'fresh',
    groups: ['bakery'],
    description: 'Bread, biscuits and breakfast cereals.',
    supplier: 'KBK',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Bread & Buns',
        code: 'BRD',
        items: [
          {
            name: 'Sandwich White Bread',
            brand: 'Konkan Bakery',
            shelf: 5,
            variants: [{ size: '400 g', unit: 'pack', cost: 32, v: 46, pack: 10 }],
          },
          {
            name: 'Brown Bread',
            brand: 'Konkan Bakery',
            shelf: 5,
            trend: 0.12,
            variants: [{ size: '400 g', unit: 'pack', cost: 42, v: 18, pack: 10 }],
          },
          {
            name: 'Ladi Pav',
            brand: 'Konkan Bakery',
            shelf: 4,
            variants: [{ size: '6 pcs', unit: 'pack', cost: 28, v: 20, pack: 10, noHyd: true }],
          },
        ],
      },
      {
        name: 'Biscuits & Cookies',
        code: 'BIS',
        items: [
          {
            name: 'Glucose Biscuits',
            brand: 'Konkan Bakery',
            shelf: 270,
            variants: [{ size: '200 g', unit: 'pack', cost: 18, v: 58, pack: 48 }],
          },
          {
            name: 'Marie Biscuits',
            brand: 'Konkan Bakery',
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', cost: 28, v: 27, pack: 36 }],
          },
          {
            name: 'Cream Biscuits',
            brand: 'Konkan Bakery',
            shelf: 240,
            variants: [{ size: '120 g', unit: 'pack', cost: 25, v: 23, pack: 48 }],
          },
          {
            name: 'Butter Cookies',
            brand: 'Konkan Bakery',
            groups: ['gifting'],
            shelf: 240,
            variants: [{ size: '200 g', unit: 'box', cost: 55, v: 8, pack: 24 }],
          },
          {
            name: 'Digestive Biscuits',
            brand: 'Konkan Bakery',
            trend: 0.2,
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', cost: 62, v: 7, pack: 24 }],
          },
        ],
      },
      {
        name: 'Breakfast',
        code: 'BFT',
        items: [
          {
            name: 'Corn Flakes',
            brand: 'Sunmill',
            variants: [{ size: '475 g', unit: 'box', cost: 164, v: 7, pack: 12 }],
          },
          {
            name: 'Rolled Oats',
            brand: 'Sunmill',
            trend: 0.28,
            variants: [{ size: '1 kg', unit: 'pack', cost: 166, v: 8, pack: 10 }],
          },
          {
            name: 'Fruit & Nut Muesli',
            brand: 'Sunmill',
            trend: 0.1,
            variants: [{ size: '500 g', unit: 'box', cost: 278, v: 2.2, pack: 12, p: 0.55 }],
          },
          {
            name: 'Thick Poha',
            brand: 'Desi Kitchen',
            variants: [{ size: '500 g', unit: 'pack', cost: 35, v: 14, pack: 20 }],
          },
          {
            name: 'Roasted Vermicelli',
            brand: 'Desi Kitchen',
            groups: ['vermicelli'],
            variants: [{ size: '400 g', unit: 'pack', cost: 38, v: 11, pack: 20 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Personal Care',
    slug: 'personal-care',
    code: 'PRC',
    gst: 18,
    margin: [0.15, 0.22],
    weekly: 'retail',
    description: 'Bath, hair, oral and skin care.',
    supplier: 'VPC',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Bath & Body',
        code: 'BTH',
        items: [
          {
            name: 'Sandal Bathing Soap',
            brand: 'Tulsi Home',
            groups: ['gifting'],
            variants: [{ size: '3 × 100 g', unit: 'pack', cost: 94, v: 19, pack: 24 }],
          },
          {
            name: 'Neem Soap',
            brand: 'Aarogya',
            variants: [{ size: '4 × 75 g', unit: 'pack', cost: 108, v: 14, pack: 24 }],
          },
          {
            name: 'Aloe Body Wash',
            brand: 'Tulsi Home',
            variants: [{ size: '250 ml', unit: 'bottle', cost: 178, v: 2.4, pack: 12, p: 0.6 }],
          },
          {
            name: 'Cool Talc',
            brand: 'Tulsi Home',
            season: 'summer',
            variants: [{ size: '300 g', unit: 'bottle', cost: 148, v: 6, pack: 12 }],
          },
        ],
      },
      {
        name: 'Hair Care',
        code: 'HAR',
        items: [
          {
            name: 'Herbal Shampoo',
            brand: 'Tulsi Home',
            variants: [
              { size: '180 ml', unit: 'bottle', cost: 143, v: 11, pack: 24 },
              { size: '650 ml', unit: 'bottle', cost: 418, v: 3, pack: 12 },
            ],
          },
          {
            name: 'Coconut Hair Oil',
            brand: 'Malabar Coast',
            groups: ['coconut'],
            variants: [{ size: '300 ml', unit: 'bottle', cost: 118, v: 16, pack: 24 }],
          },
          {
            name: 'Conditioner',
            brand: 'Tulsi Home',
            variants: [{ size: '180 ml', unit: 'bottle', cost: 172, v: 3, pack: 24 }],
          },
        ],
      },
      {
        name: 'Oral Care',
        code: 'ORL',
        items: [
          {
            name: 'Herbal Toothpaste',
            brand: 'Aarogya',
            variants: [
              { size: '150 g', unit: 'tube', cost: 84, v: 25, pack: 36 },
              { size: '2 × 150 g', unit: 'pack', cost: 158, v: 9, pack: 24 },
            ],
          },
          {
            name: 'Soft Toothbrush',
            brand: 'Aarogya',
            variants: [{ size: 'Pack of 4', unit: 'pack', cost: 94, v: 8, pack: 24 }],
          },
          {
            name: 'Mint Mouthwash',
            brand: 'Aarogya',
            trend: 0.15,
            variants: [{ size: '250 ml', unit: 'bottle', cost: 124, v: 2, pack: 12, p: 0.55 }],
          },
        ],
      },
      {
        name: 'Skin Care',
        code: 'SKN',
        items: [
          {
            name: 'Neem Face Wash',
            brand: 'Aarogya',
            trend: 0.12,
            variants: [{ size: '100 ml', unit: 'tube', cost: 138, v: 6, pack: 24 }],
          },
          {
            name: 'Moisturising Lotion',
            brand: 'Tulsi Home',
            season: 'winter',
            variants: [{ size: '400 ml', unit: 'bottle', cost: 288, v: 2.6, pack: 12 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Home Care',
    slug: 'home-care',
    code: 'HMC',
    gst: 18,
    margin: [0.12, 0.2],
    weekly: 'retail',
    groups: ['cleaning'],
    description: 'Laundry, dishwash, cleaners and pooja essentials.',
    supplier: 'KHC',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Laundry',
        code: 'LDY',
        items: [
          {
            name: 'Detergent Powder',
            brand: 'Sparkle',
            variants: [
              { size: '1 kg', unit: 'pack', cost: 108, v: 28, pack: 12 },
              { size: '4 kg', unit: 'bag', cost: 418, v: 7, pack: 4 },
            ],
          },
          {
            name: 'Liquid Detergent',
            brand: 'Sparkle',
            trend: 0.22,
            variants: [{ size: '1 L', unit: 'bottle', cost: 208, v: 8, pack: 12 }],
          },
          {
            name: 'Detergent Bar',
            brand: 'Sparkle',
            trend: -0.08,
            variants: [{ size: '4 × 250 g', unit: 'pack', cost: 84, v: 17, pack: 24 }],
          },
          {
            name: 'Fabric Conditioner',
            brand: 'Sparkle',
            variants: [{ size: '860 ml', unit: 'bottle', cost: 194, v: 3, pack: 12 }],
          },
        ],
      },
      {
        name: 'Dishwash',
        code: 'DSH',
        items: [
          {
            name: 'Dishwash Bar',
            brand: 'Sparkle',
            variants: [{ size: '3 × 200 g', unit: 'pack', cost: 58, v: 21, pack: 24 }],
          },
          {
            name: 'Dishwash Liquid Lemon',
            brand: 'Sparkle',
            trend: 0.18,
            variants: [{ size: '750 ml', unit: 'bottle', cost: 124, v: 9, pack: 12 }],
          },
        ],
      },
      {
        name: 'Cleaners',
        code: 'CLN',
        items: [
          {
            name: 'Floor Cleaner',
            brand: 'Nimbus',
            variants: [{ size: '1 L', unit: 'bottle', cost: 174, v: 9, pack: 12 }],
          },
          {
            name: 'Toilet Cleaner',
            brand: 'Nimbus',
            variants: [{ size: '500 ml', unit: 'bottle', cost: 94, v: 11, pack: 24 }],
          },
          {
            name: 'Glass Cleaner',
            brand: 'Nimbus',
            variants: [{ size: '500 ml', unit: 'bottle', cost: 104, v: 3, pack: 24 }],
          },
          {
            name: 'Garbage Bags Medium',
            brand: 'Nimbus',
            variants: [{ size: '30 pcs', unit: 'pack', cost: 84, v: 7, pack: 24 }],
          },
          {
            name: 'Mosquito Repellent Refill',
            brand: 'Nimbus',
            variants: [{ size: '45 ml', unit: 'pcs', cost: 67, v: 13, pack: 24 }],
          },
        ],
      },
      {
        name: 'Pooja Essentials',
        code: 'PJA',
        items: [
          {
            name: 'Sandal Agarbatti',
            brand: 'Tulsi Home',
            groups: ['puja'],
            variants: [{ size: '100 sticks', unit: 'box', cost: 58, v: 9, pack: 24 }],
          },
          {
            name: 'Camphor Tablets',
            brand: 'Tulsi Home',
            groups: ['puja'],
            variants: [{ size: '100 g', unit: 'box', cost: 88, v: 5, pack: 24 }],
          },
          {
            name: 'Clay Diyas',
            brand: 'Tulsi Home',
            groups: ['gifting', 'puja'],
            variants: [{ size: 'Set of 12', unit: 'box', cost: 72, v: 0.4, pack: 12, p: 0.15 }],
          },
        ],
      },
    ],
  },
  {
    name: 'Packaged Foods',
    slug: 'packaged-foods',
    code: 'PKF',
    gst: 12,
    margin: [0.14, 0.22],
    weekly: 'retail',
    shelf: 270,
    description: 'Noodles, pasta, sauces, spreads, pickles and ready-to-eat meals.',
    supplier: 'TPF',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Noodles & Pasta',
        code: 'NDL',
        items: [
          {
            name: 'Masala Instant Noodles',
            brand: 'Tapti',
            variants: [
              { size: '70 g', unit: 'pack', cost: 12, v: 72, pack: 48 },
              { size: '4-pack', unit: 'pack', cost: 47, v: 26, pack: 24 },
            ],
          },
          {
            name: 'Penne Pasta',
            brand: 'Tapti',
            trend: 0.14,
            variants: [{ size: '500 g', unit: 'pack', cost: 71, v: 7, pack: 20 }],
          },
          {
            name: 'Cup Noodles',
            brand: 'Tapti',
            variants: [{ size: '70 g', unit: 'pcs', cost: 44, v: 9, pack: 24 }],
          },
        ],
      },
      {
        name: 'Sauces & Spreads',
        code: 'SAU',
        items: [
          {
            name: 'Tomato Ketchup',
            brand: 'Tapti',
            variants: [
              { size: '500 g', unit: 'bottle', cost: 94, v: 13, pack: 24 },
              { size: '1 kg', unit: 'bottle', cost: 168, v: 4, pack: 12 },
            ],
          },
          {
            name: 'Eggless Mayonnaise',
            brand: 'Tapti',
            trend: 0.2,
            variants: [{ size: '250 g', unit: 'jar', cost: 84, v: 5, pack: 24 }],
          },
          {
            name: 'Crunchy Peanut Butter',
            brand: 'Tapti',
            trend: 0.25,
            variants: [{ size: '340 g', unit: 'jar', cost: 158, v: 4, pack: 12 }],
          },
          {
            name: 'Mixed Fruit Jam',
            brand: 'Tapti',
            variants: [{ size: '500 g', unit: 'jar', cost: 148, v: 6, pack: 12 }],
          },
          {
            name: 'Wild Forest Honey',
            brand: 'Aarogya',
            variants: [{ size: '500 g', unit: 'jar', cost: 208, v: 5, pack: 12 }],
          },
        ],
      },
      {
        name: 'Pickles & Ready to Eat',
        code: 'RTE',
        items: [
          {
            name: 'Mango Pickle',
            brand: 'Desi Kitchen',
            variants: [{ size: '400 g', unit: 'jar', cost: 94, v: 7, pack: 12 }],
          },
          {
            name: 'Lime Pickle',
            brand: 'Desi Kitchen',
            variants: [{ size: '300 g', unit: 'jar', cost: 74, v: 5, pack: 12 }],
          },
          {
            name: 'Ready-to-Eat Dal Makhani',
            brand: 'Tapti',
            variants: [{ size: '300 g', unit: 'pack', cost: 108, v: 4, pack: 24 }],
          },
          {
            name: 'Ready-to-Eat Rajma Chawal',
            brand: 'Tapti',
            variants: [{ size: '375 g', unit: 'pack', cost: 118, v: 2.2, pack: 24 }],
          },
          {
            name: 'Gulab Jamun Mix',
            brand: 'Desi Kitchen',
            groups: ['sweets_snacks', 'gifting'],
            variants: [{ size: '200 g', unit: 'box', cost: 84, v: 3, pack: 24 }],
          },
        ],
      },
    ],
  },
];

/** House-brand ("Kaveri Select") alternatives for fast movers, cheaper and supplied by the wholesaler. */
export const PRIVATE_LABEL: Array<{
  category: string;
  sub: string;
  name: string;
  size: string;
  unit: string;
  cost: number;
  v: number;
  pack: number;
}> = [
  {
    category: 'staples',
    sub: 'RIC',
    name: 'Sona Masoori Rice',
    size: '5 kg',
    unit: 'bag',
    cost: 272,
    v: 18,
    pack: 5,
  },
  {
    category: 'staples',
    sub: 'FLR',
    name: 'Whole Wheat Atta',
    size: '5 kg',
    unit: 'bag',
    cost: 198,
    v: 12,
    pack: 4,
  },
  {
    category: 'staples',
    sub: 'PLS',
    name: 'Toor Dal',
    size: '1 kg',
    unit: 'pack',
    cost: 136,
    v: 10,
    pack: 10,
  },
  {
    category: 'staples',
    sub: 'SGR',
    name: 'Refined Sugar',
    size: '1 kg',
    unit: 'pack',
    cost: 40,
    v: 14,
    pack: 10,
  },
  {
    category: 'oils-ghee',
    sub: 'OIL',
    name: 'Sunflower Oil',
    size: '1 L pouch',
    unit: 'pouch',
    cost: 127,
    v: 16,
    pack: 10,
  },
  {
    category: 'spices',
    sub: 'SPC',
    name: 'Turmeric Powder',
    size: '200 g',
    unit: 'pack',
    cost: 43,
    v: 6,
    pack: 20,
  },
  {
    category: 'beverages',
    sub: 'TEA',
    name: 'Assam CTC Tea',
    size: '250 g',
    unit: 'pack',
    cost: 104,
    v: 7,
    pack: 24,
  },
  {
    category: 'home-care',
    sub: 'LDY',
    name: 'Detergent Powder',
    size: '1 kg',
    unit: 'pack',
    cost: 98,
    v: 8,
    pack: 12,
  },
  {
    category: 'home-care',
    sub: 'DSH',
    name: 'Dishwash Bar',
    size: '3 × 200 g',
    unit: 'pack',
    cost: 52,
    v: 6,
    pack: 24,
  },
  {
    category: 'bakery',
    sub: 'BIS',
    name: 'Glucose Biscuits',
    size: '200 g',
    unit: 'pack',
    cost: 16,
    v: 14,
    pack: 48,
  },
  {
    category: 'packaged-foods',
    sub: 'NDL',
    name: 'Masala Instant Noodles',
    size: '70 g',
    unit: 'pack',
    cost: 11,
    v: 15,
    pack: 48,
  },
  {
    category: 'staples',
    sub: 'SGR',
    name: 'Iodised Salt',
    size: '1 kg',
    unit: 'pack',
    cost: 18,
    v: 9,
    pack: 25,
  },
  {
    category: 'oils-ghee',
    sub: 'GHE',
    name: 'Pure Cow Ghee',
    size: '500 ml',
    unit: 'jar',
    cost: 296,
    v: 3,
    pack: 12,
  },
  {
    category: 'staples',
    sub: 'PLS',
    name: 'Chana Dal',
    size: '1 kg',
    unit: 'pack',
    cost: 86,
    v: 5,
    pack: 10,
  },
  {
    category: 'personal-care',
    sub: 'BTH',
    name: 'Neem Soap',
    size: '4 × 75 g',
    unit: 'pack',
    cost: 99,
    v: 4,
    pack: 24,
  },
];

export interface CustomerDef {
  code: string;
  name: string;
  type: 'RETAIL' | 'WHOLESALE' | 'ONLINE';
  city: string;
  warehouse: string;
}

const RETAIL_NAMES = [
  'Sri Lakshmi Stores',
  'Annai Supermarket',
  'Balaji Provisions',
  'Murugan Departmental Store',
  'Green Basket Mart',
  'Daily Needs Superstore',
  'Shanthi Stores',
  'Om Sai Kirana',
  'FreshWay Mini Mart',
  'Royal Provision Store',
  'Nandhini Supermarket',
  'Sai Ram Traders',
  'Ganesh General Stores',
  'Anand Bhavan Stores',
  'Metro Value Mart',
  'Sunshine Supermart',
  'Deepam Stores',
  'Veeranam Groceries',
  'Maruthi Kirana',
  'Srinivasa Stores',
  'Hari Om Provisions',
  'City Fresh Market',
  'Amrutha Supermarket',
  'Kalyan Stores',
  'Vasantham Mart',
  'Pooja Provisions',
];
const WHOLESALE_NAMES = [
  'Chettinad Wholesale Traders',
  'Deccan FMCG Distributors',
  'Bharat Agencies',
  'Coastal Trading Co.',
  'Mahalakshmi Enterprises',
  'Srikanth Trading Company',
  'Vijaya Wholesale',
  'Rajdhani Distributors',
  'Kaveri Agency Network',
  'Perumal & Sons',
];
const ONLINE_NAMES = ['QuickBasket', 'DailyCart', 'KiranaKart', 'FreshDrop Online'];

export function buildCustomers(): CustomerDef[] {
  const customers: CustomerDef[] = [];
  const cities: Record<string, string> = { CHN: 'Chennai', BLR: 'Bengaluru', HYD: 'Hyderabad' };
  const whOrder = ['CHN', 'BLR', 'CHN', 'HYD', 'BLR', 'CHN'];
  RETAIL_NAMES.forEach((name, i) => {
    const wh = whOrder[i % whOrder.length] ?? 'CHN';
    customers.push({
      code: `C-R${String(i + 1).padStart(3, '0')}`,
      name,
      type: 'RETAIL',
      city: cities[wh] ?? 'Chennai',
      warehouse: wh,
    });
  });
  WHOLESALE_NAMES.forEach((name, i) => {
    const wh = whOrder[(i + 1) % whOrder.length] ?? 'CHN';
    customers.push({
      code: `C-W${String(i + 1).padStart(3, '0')}`,
      name,
      type: 'WHOLESALE',
      city: cities[wh] ?? 'Chennai',
      warehouse: wh,
    });
  });
  ONLINE_NAMES.forEach((name, i) => {
    customers.push({
      code: `C-O${String(i + 1).padStart(3, '0')}`,
      name,
      type: 'ONLINE',
      city: 'Online',
      warehouse: '*',
    });
  });
  return customers;
}

/** Additional lines merged into the subcategories above (kept separate to keep the main table readable). */
export const EXTRA_ITEMS: Array<{ category: string; sub: string; item: ItemDef }> = [
  {
    category: 'staples',
    sub: 'RIC',
    item: {
      name: 'Brown Rice',
      brand: 'Kesar Farms',
      trend: 0.22,
      variants: [{ size: '1 kg', unit: 'pack', cost: 96, v: 4, pack: 10 }],
    },
  },
  {
    category: 'staples',
    sub: 'RIC',
    item: {
      name: 'Sona Masoori Rice',
      brand: 'Annapurna Harvest',
      groups: ['rice_jaggery'],
      variants: [{ size: '10 kg', unit: 'bag', cost: 572, v: 14, pack: 2 }],
    },
  },
  {
    category: 'staples',
    sub: 'FLR',
    item: {
      name: 'Whole Wheat Atta',
      brand: 'Sunmill',
      variants: [{ size: '1 kg', unit: 'pack', cost: 46, v: 16, pack: 10 }],
    },
  },
  {
    category: 'staples',
    sub: 'FLR',
    item: {
      name: 'Sabudana',
      brand: 'Desi Kitchen',
      groups: ['puja'],
      variants: [{ size: '500 g', unit: 'pack', cost: 48, v: 3, pack: 12 }],
    },
  },
  {
    category: 'staples',
    sub: 'PLS',
    item: {
      name: 'Green Moong Whole',
      brand: 'Desi Kitchen',
      variants: [{ size: '500 g', unit: 'pack', cost: 62, v: 5, pack: 12 }],
    },
  },
  {
    category: 'staples',
    sub: 'PLS',
    item: {
      name: 'Black Urad Whole',
      brand: 'Desi Kitchen',
      variants: [{ size: '500 g', unit: 'pack', cost: 64, v: 3, pack: 12 }],
    },
  },
  {
    category: 'staples',
    sub: 'SGR',
    item: {
      name: 'Refined Sugar',
      brand: 'Sunmill',
      groups: ['sweets_snacks'],
      variants: [{ size: '25 kg', unit: 'bag', cost: 1010, v: 3, p: 0.5 }],
    },
  },
  {
    category: 'oils-ghee',
    sub: 'OIL',
    item: {
      name: 'Groundnut Oil',
      brand: 'Malabar Coast',
      variants: [{ size: '15 L', unit: 'tin', cost: 2480, v: 1.2, p: 0.35 }],
    },
  },
  {
    category: 'oils-ghee',
    sub: 'OIL',
    item: {
      name: 'Extra Virgin Olive Oil',
      brand: 'Kesar Farms',
      trend: 0.12,
      variants: [{ size: '500 ml', unit: 'bottle', cost: 468, v: 1.4, pack: 12, p: 0.55, noHyd: true }],
    },
  },
  {
    category: 'oils-ghee',
    sub: 'OIL',
    item: {
      name: 'Sunflower Oil',
      brand: 'Malabar Coast',
      variants: [{ size: '1 L bottle', unit: 'bottle', cost: 142, v: 14, pack: 12 }],
    },
  },
  {
    category: 'oils-ghee',
    sub: 'GHE',
    item: {
      name: 'Pure Cow Ghee',
      brand: 'Himgiri',
      groups: ['ghee', 'puja'],
      variants: [{ size: '200 ml', unit: 'jar', cost: 128, v: 11, pack: 24 }],
    },
  },
  {
    category: 'spices',
    sub: 'SPC',
    item: {
      name: 'Kashmiri Chilli Powder',
      brand: 'Aarogya',
      variants: [{ size: '100 g', unit: 'pack', cost: 64, v: 6, pack: 20 }],
    },
  },
  {
    category: 'spices',
    sub: 'SPC',
    item: {
      name: 'Fennel Seeds',
      brand: 'Aarogya',
      variants: [{ size: '100 g', unit: 'pack', cost: 36, v: 4, pack: 20 }],
    },
  },
  {
    category: 'spices',
    sub: 'SPC',
    item: {
      name: 'Fenugreek Seeds',
      brand: 'Aarogya',
      variants: [{ size: '100 g', unit: 'pack', cost: 22, v: 5, pack: 20 }],
    },
  },
  {
    category: 'spices',
    sub: 'SPC',
    item: {
      name: 'Asafoetida',
      brand: 'Malabar Coast',
      variants: [{ size: '50 g', unit: 'box', cost: 88, v: 4, pack: 24 }],
    },
  },
  {
    category: 'spices',
    sub: 'SPC',
    item: {
      name: 'Cinnamon Sticks',
      brand: 'Malabar Coast',
      variants: [{ size: '50 g', unit: 'pack', cost: 52, v: 2, pack: 20, p: 0.55 }],
    },
  },
  {
    category: 'spices',
    sub: 'MSL',
    item: {
      name: 'Kitchen King Masala',
      brand: 'Desi Kitchen',
      variants: [{ size: '100 g', unit: 'box', cost: 60, v: 4, pack: 24 }],
    },
  },
  {
    category: 'spices',
    sub: 'MSL',
    item: {
      name: 'Kasuri Methi',
      brand: 'Desi Kitchen',
      variants: [{ size: '25 g', unit: 'box', cost: 28, v: 3, pack: 24 }],
    },
  },
  {
    category: 'snacks',
    sub: 'NMK',
    item: {
      name: 'Ribbon Pakoda',
      brand: 'Crispo',
      variants: [{ size: '200 g', unit: 'pack', cost: 44, v: 6, pack: 24 }],
    },
  },
  {
    category: 'snacks',
    sub: 'NMK',
    item: {
      name: 'Butter Murukku',
      brand: 'Crispo',
      groups: ['coconut'],
      variants: [{ size: '200 g', unit: 'pack', cost: 46, v: 7, pack: 24 }],
    },
  },
  {
    category: 'snacks',
    sub: 'CHP',
    item: {
      name: 'Classic Nut Cracker',
      brand: 'Crispo',
      variants: [{ size: '150 g', unit: 'pack', cost: 34, v: 8, pack: 24 }],
    },
  },
  {
    category: 'snacks',
    sub: 'DRY',
    item: {
      name: 'Salted Pistachios',
      brand: 'Kesar Farms',
      groups: ['dry_fruits'],
      shelf: 240,
      variants: [{ size: '200 g', unit: 'pack', cost: 246, v: 2.2, pack: 12 }],
    },
  },
  {
    category: 'snacks',
    sub: 'DRY',
    item: {
      name: 'Kaju Katli',
      brand: 'Kesar Farms',
      groups: ['gifting'],
      shelf: 25,
      variants: [{ size: '250 g', unit: 'box', cost: 238, v: 1.6, pack: 6, p: 0.45 }],
    },
  },
  {
    category: 'beverages',
    sub: 'TEA',
    item: {
      name: 'Masala Chai Premix',
      brand: 'Chai Bagan',
      season: 'winter',
      variants: [{ size: '10 sachets', unit: 'box', cost: 88, v: 5, pack: 24 }],
    },
  },
  {
    category: 'beverages',
    sub: 'TEA',
    item: {
      name: 'Filter Coffee Powder',
      brand: 'Nilgiri Estates',
      season: 'winter',
      variants: [{ size: '200 g', unit: 'pack', cost: 104, v: 11, pack: 24 }],
    },
  },
  {
    category: 'beverages',
    sub: 'JUI',
    item: {
      name: 'Orange Drink',
      brand: 'Godavari',
      season: 'summer',
      shelf: 180,
      variants: [{ size: '600 ml', unit: 'bottle', cost: 30, v: 11, pack: 24 }],
    },
  },
  {
    category: 'beverages',
    sub: 'JUI',
    item: {
      name: 'Tender Coconut Water',
      brand: 'Malabar Coast',
      season: 'summer',
      trend: 0.18,
      shelf: 180,
      variants: [{ size: '200 ml', unit: 'carton', cost: 32, v: 9, pack: 24 }],
    },
  },
  {
    category: 'beverages',
    sub: 'JUI',
    item: {
      name: 'Energy Drink',
      brand: 'Fizzup',
      trend: 0.2,
      shelf: 300,
      variants: [{ size: '250 ml', unit: 'can', cost: 86, v: 6, pack: 24 }],
    },
  },
  {
    category: 'dairy',
    sub: 'MLK',
    item: {
      name: 'Toned Milk',
      brand: 'Himgiri',
      shelf: 3,
      variants: [{ size: '1 L', unit: 'pouch', cost: 50, v: 55, pack: 12 }],
    },
  },
  {
    category: 'dairy',
    sub: 'MLK',
    item: {
      name: 'Greek Yogurt',
      brand: 'Himgiri',
      trend: 0.3,
      shelf: 21,
      variants: [{ size: '100 g', unit: 'tub', cost: 38, v: 7, pack: 12, noHyd: true }],
    },
  },
  {
    category: 'dairy',
    sub: 'MLK',
    item: {
      name: 'Flavoured Milk',
      brand: 'Himgiri',
      season: 'summer',
      shelf: 180,
      variants: [{ size: '180 ml', unit: 'bottle', cost: 26, v: 18, pack: 24 }],
    },
  },
  {
    category: 'dairy',
    sub: 'CHS',
    item: {
      name: 'Mozzarella Cheese',
      brand: 'Himgiri',
      trend: 0.18,
      shelf: 120,
      variants: [{ size: '200 g', unit: 'pack', cost: 118, v: 3, pack: 12 }],
    },
  },
  {
    category: 'dairy',
    sub: 'FRZ',
    item: {
      name: 'Frozen Malabar Paratha',
      brand: 'Himgiri',
      shelf: 270,
      variants: [{ size: '5 pcs', unit: 'pack', cost: 72, v: 8, pack: 12 }],
    },
  },
  {
    category: 'bakery',
    sub: 'BRD',
    item: {
      name: 'Multigrain Bread',
      brand: 'Konkan Bakery',
      trend: 0.2,
      shelf: 5,
      variants: [{ size: '400 g', unit: 'pack', cost: 48, v: 9, pack: 10 }],
    },
  },
  {
    category: 'bakery',
    sub: 'BRD',
    item: {
      name: 'Burger Buns',
      brand: 'Konkan Bakery',
      shelf: 4,
      variants: [{ size: '4 pcs', unit: 'pack', cost: 32, v: 8, pack: 10 }],
    },
  },
  {
    category: 'bakery',
    sub: 'BIS',
    item: {
      name: 'Milk Rusk',
      brand: 'Konkan Bakery',
      shelf: 180,
      variants: [{ size: '300 g', unit: 'pack', cost: 44, v: 12, pack: 24 }],
    },
  },
  {
    category: 'bakery',
    sub: 'BIS',
    item: {
      name: 'Choco Chip Cookies',
      brand: 'Konkan Bakery',
      shelf: 240,
      variants: [{ size: '150 g', unit: 'pack', cost: 42, v: 9, pack: 24 }],
    },
  },
  {
    category: 'bakery',
    sub: 'BFT',
    item: {
      name: 'Wheat Flakes',
      brand: 'Sunmill',
      variants: [{ size: '500 g', unit: 'box', cost: 138, v: 2.4, pack: 12, p: 0.6 }],
    },
  },
  {
    category: 'personal-care',
    sub: 'BTH',
    item: {
      name: 'Lemon Soap',
      brand: 'Aarogya',
      variants: [{ size: '4 × 75 g', unit: 'pack', cost: 96, v: 9, pack: 24 }],
    },
  },
  {
    category: 'personal-care',
    sub: 'BTH',
    item: {
      name: 'Hand Wash Refill',
      brand: 'Tulsi Home',
      variants: [{ size: '750 ml', unit: 'pouch', cost: 112, v: 7, pack: 12 }],
    },
  },
  {
    category: 'personal-care',
    sub: 'HAR',
    item: {
      name: 'Anti-dandruff Shampoo',
      brand: 'Tulsi Home',
      variants: [{ size: '180 ml', unit: 'bottle', cost: 168, v: 5, pack: 24 }],
    },
  },
  {
    category: 'personal-care',
    sub: 'BTH',
    item: {
      name: 'Shaving Cream',
      brand: 'Tulsi Home',
      variants: [{ size: '70 g', unit: 'tube', cost: 58, v: 4, pack: 24 }],
    },
  },
  {
    category: 'personal-care',
    sub: 'BTH',
    item: {
      name: 'Sanitary Pads Regular',
      brand: 'Little Lotus',
      variants: [{ size: '15 pcs', unit: 'pack', cost: 74, v: 12, pack: 24 }],
    },
  },
  {
    category: 'personal-care',
    sub: 'BTH',
    item: {
      name: 'Baby Soap',
      brand: 'Little Lotus',
      variants: [{ size: '75 g', unit: 'pcs', cost: 42, v: 5, pack: 48 }],
    },
  },
  {
    category: 'home-care',
    sub: 'LDY',
    item: {
      name: 'Detergent Powder',
      brand: 'Sparkle',
      variants: [{ size: '500 g', unit: 'pack', cost: 56, v: 19, pack: 24 }],
    },
  },
  {
    category: 'home-care',
    sub: 'CLN',
    item: {
      name: 'Liquid Bleach',
      brand: 'Nimbus',
      variants: [{ size: '500 ml', unit: 'bottle', cost: 48, v: 4, pack: 24 }],
    },
  },
  {
    category: 'home-care',
    sub: 'DSH',
    item: {
      name: 'Scrub Pads',
      brand: 'Sparkle',
      variants: [{ size: '3 pcs', unit: 'pack', cost: 32, v: 14, pack: 48 }],
    },
  },
  {
    category: 'home-care',
    sub: 'CLN',
    item: {
      name: 'Room Freshener',
      brand: 'Nimbus',
      groups: ['gifting'],
      variants: [{ size: '240 ml', unit: 'can', cost: 132, v: 3, pack: 24 }],
    },
  },
  {
    category: 'home-care',
    sub: 'CLN',
    item: {
      name: 'Naphthalene Balls',
      brand: 'Nimbus',
      variants: [{ size: '200 g', unit: 'pack', cost: 46, v: 3, pack: 24, p: 0.7 }],
    },
  },
  {
    category: 'home-care',
    sub: 'CLN',
    item: {
      name: 'Kitchen Towels',
      brand: 'Nimbus',
      trend: 0.15,
      variants: [{ size: '2 rolls', unit: 'pack', cost: 88, v: 5, pack: 24 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'NDL',
    item: {
      name: 'Hakka Noodles',
      brand: 'Tapti',
      variants: [{ size: '150 g', unit: 'pack', cost: 32, v: 8, pack: 30 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'NDL',
    item: {
      name: 'Elbow Macaroni',
      brand: 'Tapti',
      variants: [{ size: '500 g', unit: 'pack', cost: 64, v: 4, pack: 20 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'SAU',
    item: {
      name: 'Green Chilli Sauce',
      brand: 'Tapti',
      variants: [{ size: '200 g', unit: 'bottle', cost: 42, v: 6, pack: 24 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'RTE',
    item: {
      name: 'Soya Chunks',
      brand: 'Desi Kitchen',
      variants: [{ size: '200 g', unit: 'pack', cost: 38, v: 8, pack: 24 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'RTE',
    item: {
      name: 'Custard Powder',
      brand: 'Desi Kitchen',
      groups: ['sweets_snacks'],
      variants: [{ size: '100 g', unit: 'box', cost: 36, v: 4, pack: 24 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'SAU',
    item: {
      name: 'Chocolate Hazelnut Spread',
      brand: 'Tapti',
      trend: 0.16,
      variants: [{ size: '350 g', unit: 'jar', cost: 268, v: 2, pack: 12, p: 0.6 }],
    },
  },
  {
    category: 'packaged-foods',
    sub: 'RTE',
    item: {
      name: 'Instant Upma Mix',
      brand: 'Desi Kitchen',
      variants: [{ size: '200 g', unit: 'pack', cost: 42, v: 6, pack: 24 }],
    },
  },
];
