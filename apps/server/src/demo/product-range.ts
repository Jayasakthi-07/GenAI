import type { CategoryDef } from './catalog';

/**
 * The product range: well-known brands found in any Tamil Nadu supermarket. MRPs are realistic
 * approximations, not quotes; `v` is average network demand in units a day.
 */
export const CATEGORIES: CategoryDef[] = [
  {
    name: 'Staples & Grains',
    slug: 'staples',
    code: 'STP',
    gst: 5,
    discount: [0.05, 0.09],
    margin: [0.04, 0.07],
    weekly: 'staple',
    description: 'Rice, atta and flours, pulses, sugar and salt.',
    supplier: 'VGT',
    alternates: ['TFA', 'SWM'],
    subcategories: [
      {
        name: 'Rice',
        code: 'RIC',
        items: [
          {
            name: 'Organic Sona Masuri Rice',
            brand: '24 Mantra',
            groups: ['rice_jaggery'],
            variants: [
              { size: '5 kg', unit: 'bag', mrp: 560, v: 34, pack: 5 },
              { size: '10 kg', unit: 'bag', mrp: 1090, v: 12, pack: 2 },
              { size: '1 kg', unit: 'pack', mrp: 120, v: 20, pack: 10 },
            ],
          },
          {
            name: 'Basmati Rice Classic',
            brand: 'India Gate',
            groups: ['vermicelli'],
            trend: 0.12,
            variants: [
              { size: '1 kg', unit: 'pack', mrp: 235, v: 12, pack: 10 },
              { size: '5 kg', unit: 'bag', mrp: 1125, v: 5, pack: 4 },
            ],
          },
          {
            name: 'Feast Rozzana Basmati Rice',
            brand: 'India Gate',
            groups: ['vermicelli'],
            variants: [{ size: '5 kg', unit: 'bag', mrp: 525, v: 11, pack: 4 }],
          },
          {
            name: 'Rozana Super Basmati Rice',
            brand: 'Daawat',
            groups: ['vermicelli'],
            variants: [{ size: '5 kg', unit: 'bag', mrp: 560, v: 7, pack: 4 }],
          },
          {
            name: 'Biryani Special Basmati Rice',
            brand: 'Fortune',
            groups: ['vermicelli'],
            variants: [{ size: '1 kg', unit: 'pack', mrp: 175, v: 10, pack: 10 }],
          },
          {
            name: 'Organic Brown Rice',
            brand: '24 Mantra',
            trend: 0.22,
            variants: [{ size: '1 kg', unit: 'pack', mrp: 150, v: 3, pack: 10 }],
          },
        ],
      },
      {
        name: 'Atta & Flours',
        code: 'FLR',
        items: [
          {
            name: 'Shudh Chakki Atta',
            brand: 'Aashirvaad',
            variants: [
              { size: '5 kg', unit: 'bag', mrp: 295, v: 40, pack: 4 },
              { size: '10 kg', unit: 'bag', mrp: 570, v: 14, pack: 2 },
              { size: '1 kg', unit: 'pack', mrp: 70, v: 16, pack: 10 },
            ],
          },
          {
            name: 'Multigrain Atta',
            brand: 'Aashirvaad',
            trend: 0.2,
            variants: [{ size: '1 kg', unit: 'pack', mrp: 82, v: 6, pack: 10 }],
          },
          {
            name: 'Chakki Fresh Atta',
            brand: 'Pillsbury',
            variants: [{ size: '5 kg', unit: 'bag', mrp: 280, v: 9, pack: 4 }],
          },
          {
            name: 'Chakki Fresh Atta',
            brand: 'Fortune',
            variants: [{ size: '5 kg', unit: 'bag', mrp: 265, v: 8, pack: 4 }],
          },
          {
            name: 'Besan',
            brand: 'Tata Sampann',
            groups: ['sweets_snacks'],
            variants: [
              { size: '500 g', unit: 'pack', mrp: 75, v: 12, pack: 12 },
              { size: '1 kg', unit: 'pack', mrp: 145, v: 7, pack: 10 },
            ],
          },
          {
            name: 'Rice Flour',
            brand: 'Aachi',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 78, v: 10, pack: 10 }],
          },
          {
            name: 'Ragi Flour',
            brand: 'Aachi',
            trend: 0.25,
            variants: [{ size: '500 g', unit: 'pack', mrp: 50, v: 6, pack: 12 }],
          },
        ],
      },
      {
        name: 'Pulses',
        code: 'PLS',
        items: [
          {
            name: 'Unpolished Toor Dal',
            brand: 'Tata Sampann',
            variants: [
              { size: '1 kg', unit: 'pack', mrp: 189, v: 40, pack: 10 },
              { size: '500 g', unit: 'pack', mrp: 99, v: 14, pack: 12 },
            ],
          },
          {
            name: 'Unpolished Moong Dal',
            brand: 'Tata Sampann',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 165, v: 16, pack: 10 }],
          },
          {
            name: 'Unpolished Chana Dal',
            brand: 'Tata Sampann',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 125, v: 15, pack: 10 }],
          },
          {
            name: 'Unpolished Urad Dal',
            brand: 'Tata Sampann',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 175, v: 22, pack: 10 }],
          },
          {
            name: 'Unpolished Masoor Dal',
            brand: 'Tata Sampann',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 130, v: 6, pack: 10 }],
          },
          {
            name: 'Kabuli Chana',
            brand: 'Tata Sampann',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 170, v: 7, pack: 10 }],
          },
          {
            name: 'Green Moong Whole',
            brand: 'Tata Sampann',
            variants: [{ size: '500 g', unit: 'pack', mrp: 85, v: 5, pack: 12 }],
          },
          {
            name: 'Organic Toor Dal',
            brand: '24 Mantra',
            trend: 0.15,
            variants: [{ size: '1 kg', unit: 'pack', mrp: 235, v: 6, pack: 10 }],
          },
        ],
      },
      {
        name: 'Sugar & Salt',
        code: 'SGR',
        items: [
          {
            name: 'Pure & Hygienic Sugar',
            brand: 'Madhur',
            groups: ['sweets_snacks'],
            variants: [
              { size: '1 kg', unit: 'pack', mrp: 60, v: 48, pack: 10 },
              { size: '5 kg', unit: 'bag', mrp: 285, v: 12, pack: 4 },
            ],
          },
          {
            name: 'Salt',
            brand: 'Tata',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 30, v: 50, pack: 25 }],
          },
          {
            name: 'Salt Lite',
            brand: 'Tata',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 52, v: 1.4, pack: 12, p: 0.4 }],
          },
          {
            name: 'Iodised Salt',
            brand: 'Aashirvaad',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 28, v: 12, pack: 25 }],
          },
          {
            name: 'Organic Jaggery Powder',
            brand: '24 Mantra',
            groups: ['rice_jaggery'],
            variants: [{ size: '500 g', unit: 'pack', mrp: 85, v: 8, pack: 12 }],
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
    discount: [0.05, 0.09],
    margin: [0.04, 0.07],
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
            name: 'Sunlite Refined Sunflower Oil',
            brand: 'Fortune',
            variants: [
              { size: '1 L pouch', unit: 'pouch', mrp: 165, v: 45, pack: 10 },
              { size: '5 L', unit: 'can', mrp: 800, v: 9, pack: 4 },
              { size: '15 L', unit: 'tin', mrp: 2350, v: 2.5, p: 0.45 },
            ],
          },
          {
            name: 'Refined Sunflower Oil',
            brand: 'Gold Winner',
            variants: [
              { size: '1 L pouch', unit: 'pouch', mrp: 160, v: 40, pack: 10 },
              { size: '5 L', unit: 'can', mrp: 780, v: 8, pack: 4 },
            ],
          },
          {
            name: 'Filtered Groundnut Oil',
            brand: 'Fortune',
            variants: [
              { size: '1 L', unit: 'bottle', mrp: 205, v: 16, pack: 12 },
              { size: '15 L', unit: 'tin', mrp: 2950, v: 1.2, p: 0.35 },
            ],
          },
          {
            name: 'Gingelly Oil',
            brand: 'Idhayam',
            groups: ['puja'],
            variants: [
              { size: '500 ml', unit: 'bottle', mrp: 225, v: 10, pack: 12 },
              { size: '1 L', unit: 'bottle', mrp: 440, v: 5, pack: 12 },
            ],
          },
          {
            name: 'Gold Refined Oil',
            brand: 'Saffola',
            trend: 0.15,
            variants: [
              { size: '1 L pouch', unit: 'pouch', mrp: 205, v: 10, pack: 10 },
              { size: '5 L', unit: 'can', mrp: 990, v: 3, pack: 4 },
            ],
          },
          {
            name: 'Kachi Ghani Mustard Oil',
            brand: 'Fortune',
            variants: [{ size: '1 L', unit: 'bottle', mrp: 190, v: 3, pack: 12 }],
          },
          {
            name: 'Pure Olive Oil',
            brand: 'Figaro',
            trend: 0.12,
            variants: [{ size: '500 ml', unit: 'bottle', mrp: 645, v: 1.4, pack: 12, p: 0.55, noMdu: true }],
          },
        ],
      },
      {
        name: 'Ghee & Vanaspati',
        code: 'GHE',
        items: [
          {
            name: 'Ghee',
            brand: 'Aavin',
            groups: ['ghee', 'sweets_snacks'],
            variants: [
              { size: '500 ml', unit: 'jar', mrp: 365, v: 13, pack: 12 },
              { size: '1 L', unit: 'jar', mrp: 700, v: 9, pack: 6 },
            ],
          },
          {
            name: 'Ghee',
            brand: 'Aavin',
            groups: ['ghee', 'puja'],
            variants: [{ size: '200 ml', unit: 'jar', mrp: 155, v: 10, pack: 24 }],
          },
          {
            name: 'Cow Ghee',
            brand: 'GRB',
            groups: ['ghee'],
            variants: [{ size: '500 ml', unit: 'jar', mrp: 385, v: 6, pack: 12 }],
          },
          {
            name: 'Pure Ghee',
            brand: 'Amul',
            groups: ['ghee'],
            variants: [{ size: '1 L', unit: 'jar', mrp: 650, v: 5, pack: 6 }],
          },
          {
            name: 'Svasti Pure Cow Ghee',
            brand: 'Aashirvaad',
            groups: ['ghee'],
            variants: [{ size: '500 ml', unit: 'jar', mrp: 360, v: 4, pack: 12 }],
          },
          {
            name: 'Vanaspati',
            brand: 'Dalda',
            groups: ['sweets_snacks'],
            trend: -0.15,
            variants: [{ size: '1 L pouch', unit: 'pouch', mrp: 175, v: 4, pack: 10 }],
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
    discount: [0.12, 0.18],
    margin: [0.08, 0.12],
    weekly: 'retail',
    description: 'Spice powders and blended masalas.',
    supplier: 'EST',
    alternates: ['TFA', 'SWM'],
    subcategories: [
      {
        name: 'Spice Powders',
        code: 'SPC',
        items: [
          {
            name: 'Turmeric Powder',
            brand: 'Aachi',
            variants: [
              { size: '200 g', unit: 'pack', mrp: 70, v: 20, pack: 20 },
              { size: '500 g', unit: 'pack', mrp: 165, v: 6, pack: 12 },
            ],
          },
          {
            name: 'Chilli Powder',
            brand: 'Aachi',
            variants: [
              { size: '200 g', unit: 'pack', mrp: 85, v: 18, pack: 20 },
              { size: '500 g', unit: 'pack', mrp: 200, v: 6, pack: 12 },
            ],
          },
          {
            name: 'Coriander Powder',
            brand: 'Sakthi',
            variants: [{ size: '200 g', unit: 'pack', mrp: 52, v: 14, pack: 20 }],
          },
          {
            name: 'Turmeric Powder',
            brand: 'Everest',
            variants: [{ size: '100 g', unit: 'box', mrp: 38, v: 8, pack: 24 }],
          },
          {
            name: 'Kashmirilal Chilli Powder',
            brand: 'Everest',
            variants: [{ size: '100 g', unit: 'box', mrp: 90, v: 6, pack: 24 }],
          },
          {
            name: 'Jeera Powder',
            brand: 'Everest',
            variants: [{ size: '100 g', unit: 'box', mrp: 85, v: 5, pack: 24 }],
          },
          {
            name: 'Black Pepper Powder',
            brand: 'Catch',
            variants: [{ size: '100 g', unit: 'pack', mrp: 120, v: 7, pack: 20 }],
          },
          {
            name: 'Compounded Asafoetida',
            brand: 'LG',
            variants: [{ size: '50 g', unit: 'box', mrp: 98, v: 6, pack: 24 }],
          },
        ],
      },
      {
        name: 'Blended Masalas',
        code: 'MSL',
        items: [
          {
            name: 'Sambar Powder',
            brand: 'Aachi',
            variants: [{ size: '200 g', unit: 'pack', mrp: 72, v: 16, pack: 20 }],
          },
          {
            name: 'Sambar Powder',
            brand: 'Sakthi',
            variants: [{ size: '200 g', unit: 'pack', mrp: 70, v: 10, pack: 20 }],
          },
          {
            name: 'Sambar Powder',
            brand: 'MTR',
            variants: [{ size: '200 g', unit: 'pack', mrp: 85, v: 6, pack: 20 }],
          },
          {
            name: 'Rasam Powder',
            brand: 'Sakthi',
            variants: [{ size: '100 g', unit: 'pack', mrp: 40, v: 9, pack: 24 }],
          },
          {
            name: 'Fish Curry Masala',
            brand: 'Sakthi',
            variants: [{ size: '50 g', unit: 'pack', mrp: 35, v: 5, pack: 24 }],
          },
          {
            name: 'Chicken 65 Masala',
            brand: 'Aachi',
            variants: [{ size: '50 g', unit: 'pack', mrp: 35, v: 9, pack: 24 }],
          },
          {
            name: 'Chicken Biryani Masala',
            brand: 'Aachi',
            groups: ['vermicelli'],
            variants: [{ size: '50 g', unit: 'pack', mrp: 38, v: 8, pack: 24 }],
          },
          {
            name: 'Garam Masala',
            brand: 'Everest',
            variants: [{ size: '100 g', unit: 'box', mrp: 92, v: 9, pack: 24 }],
          },
          {
            name: 'Chicken Masala',
            brand: 'Everest',
            variants: [{ size: '100 g', unit: 'box', mrp: 85, v: 6, pack: 24 }],
          },
          {
            name: 'Pav Bhaji Masala',
            brand: 'Everest',
            variants: [{ size: '100 g', unit: 'box', mrp: 82, v: 3, pack: 24 }],
          },
          {
            name: 'Kasuri Methi',
            brand: 'Everest',
            variants: [{ size: '25 g', unit: 'box', mrp: 34, v: 3, pack: 24 }],
          },
          {
            name: 'Chana Masala',
            brand: 'MDH',
            variants: [{ size: '100 g', unit: 'box', mrp: 85, v: 4, pack: 24 }],
          },
          {
            name: 'Kitchen King Masala',
            brand: 'MDH',
            variants: [{ size: '100 g', unit: 'box', mrp: 90, v: 4, pack: 24 }],
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
    discount: [0.12, 0.16],
    margin: [0.07, 0.11],
    weekly: 'retail',
    shelf: 150,
    description: 'Namkeen, chips, chocolates, sweets and dry fruits.',
    supplier: 'CSD',
    alternates: ['SWM'],
    groups: ['sweets_snacks'],
    subcategories: [
      {
        name: 'Namkeen',
        code: 'NMK',
        items: [
          {
            name: 'Aloo Bhujia',
            brand: "Haldiram's",
            variants: [
              { size: '200 g', unit: 'pack', mrp: 55, v: 22, pack: 24 },
              { size: '1 kg', unit: 'pack', mrp: 255, v: 4, pack: 10 },
            ],
          },
          {
            name: 'Moong Dal',
            brand: "Haldiram's",
            variants: [{ size: '200 g', unit: 'pack', mrp: 55, v: 9, pack: 24 }],
          },
          {
            name: 'Khatta Meetha',
            brand: "Haldiram's",
            variants: [{ size: '200 g', unit: 'pack', mrp: 55, v: 7, pack: 24 }],
          },
          {
            name: 'Navrattan Mixture',
            brand: "Haldiram's",
            variants: [{ size: '200 g', unit: 'pack', mrp: 55, v: 8, pack: 24 }],
          },
          {
            name: 'Nut Cracker',
            brand: "Haldiram's",
            variants: [{ size: '200 g', unit: 'pack', mrp: 60, v: 8, pack: 24 }],
          },
          {
            name: 'All in One',
            brand: "Haldiram's",
            variants: [{ size: '200 g', unit: 'pack', mrp: 55, v: 6, pack: 24 }],
          },
          {
            name: 'Masala Munch',
            brand: 'Kurkure',
            shelf: 120,
            variants: [{ size: '75 g', unit: 'pack', mrp: 20, v: 40, pack: 48 }],
          },
          {
            name: 'Mad Angles Achaari Masti',
            brand: 'Bingo!',
            shelf: 120,
            variants: [{ size: '72.5 g', unit: 'pack', mrp: 20, v: 20, pack: 48 }],
          },
          {
            name: 'Tedhe Medhe Masala Tadka',
            brand: 'Bingo!',
            shelf: 120,
            variants: [{ size: '90 g', unit: 'pack', mrp: 20, v: 10, pack: 48 }],
          },
        ],
      },
      {
        name: 'Chips',
        code: 'CHP',
        items: [
          {
            name: 'Classic Salted',
            brand: "Lay's",
            shelf: 120,
            variants: [
              { size: '48 g', unit: 'pack', mrp: 20, v: 50, pack: 48 },
              { size: '90 g', unit: 'pack', mrp: 50, v: 18, pack: 36 },
            ],
          },
          {
            name: "India's Magic Masala",
            brand: "Lay's",
            shelf: 120,
            variants: [{ size: '48 g', unit: 'pack', mrp: 20, v: 45, pack: 48 }],
          },
          {
            name: 'Original',
            brand: 'Pringles',
            shelf: 240,
            variants: [{ size: '107 g', unit: 'can', mrp: 115, v: 3, pack: 12 }],
          },
        ],
      },
      {
        name: 'Chocolates',
        code: 'CHO',
        items: [
          {
            name: 'Dairy Milk',
            brand: 'Cadbury',
            shelf: 270,
            variants: [{ size: '23 g', unit: 'pcs', mrp: 20, v: 40, pack: 56 }],
          },
          {
            name: 'Dairy Milk Silk',
            brand: 'Cadbury',
            shelf: 270,
            variants: [{ size: '60 g', unit: 'pcs', mrp: 90, v: 10, pack: 36 }],
          },
          {
            name: '5 Star',
            brand: 'Cadbury',
            shelf: 270,
            variants: [{ size: '40 g', unit: 'pcs', mrp: 20, v: 14, pack: 48 }],
          },
          {
            name: 'KitKat 4 Finger',
            brand: 'Nestlé',
            shelf: 270,
            variants: [{ size: '37.3 g', unit: 'pcs', mrp: 40, v: 12, pack: 48 }],
          },
          {
            name: 'Celebrations Gift Pack',
            brand: 'Cadbury',
            groups: ['gifting'],
            shelf: 270,
            variants: [{ size: '286 g', unit: 'box', mrp: 499, v: 0.8, pack: 12, p: 0.4 }],
          },
          {
            name: 'Chocolates',
            brand: 'Ferrero Rocher',
            groups: ['gifting'],
            shelf: 270,
            variants: [{ size: '16 pcs', unit: 'box', mrp: 949, v: 0.5, pack: 6, p: 0.3 }],
          },
        ],
      },
      {
        name: 'Sweets & Dry Fruits',
        code: 'DRY',
        items: [
          {
            name: 'Soan Papdi',
            brand: "Haldiram's",
            groups: ['gifting'],
            shelf: 120,
            variants: [{ size: '500 g', unit: 'box', mrp: 160, v: 3, pack: 12 }],
          },
          {
            name: 'Gulab Jamun',
            brand: "Haldiram's",
            groups: ['gifting'],
            shelf: 270,
            variants: [{ size: '1 kg', unit: 'tin', mrp: 260, v: 2, pack: 12 }],
          },
          {
            name: 'Premium Whole Cashews',
            brand: 'Happilo',
            groups: ['dry_fruits'],
            shelf: 240,
            variants: [{ size: '200 g', unit: 'pack', mrp: 299, v: 7, pack: 12 }],
          },
          {
            name: 'Premium California Almonds',
            brand: 'Happilo',
            groups: ['dry_fruits'],
            shelf: 300,
            variants: [{ size: '200 g', unit: 'pack', mrp: 249, v: 6, pack: 12 }],
          },
          {
            name: 'Seedless Raisins',
            brand: 'Happilo',
            groups: ['dry_fruits'],
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', mrp: 160, v: 4, pack: 12 }],
          },
          {
            name: 'Roasted & Salted Pistachios',
            brand: 'Happilo',
            groups: ['dry_fruits'],
            shelf: 240,
            variants: [{ size: '200 g', unit: 'pack', mrp: 399, v: 2.2, pack: 12 }],
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
    discount: [0.1, 0.15],
    margin: [0.06, 0.1],
    weekly: 'retail',
    description: 'Tea, coffee, juices, soft drinks, water and health drinks.',
    supplier: 'MBA',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Tea & Coffee',
        code: 'TEA',
        items: [
          {
            name: 'Premium',
            brand: 'Tata Tea',
            season: 'winter',
            variants: [
              { size: '250 g', unit: 'pack', mrp: 155, v: 18, pack: 24 },
              { size: '1 kg', unit: 'pack', mrp: 580, v: 5, pack: 10 },
            ],
          },
          {
            name: '3 Roses',
            brand: 'Brooke Bond',
            season: 'winter',
            variants: [{ size: '250 g', unit: 'pack', mrp: 150, v: 16, pack: 24 }],
          },
          {
            name: 'Red Label',
            brand: 'Brooke Bond',
            season: 'winter',
            variants: [{ size: '250 g', unit: 'pack', mrp: 155, v: 8, pack: 24 }],
          },
          {
            name: 'Green Tea Honey Lemon',
            brand: 'Lipton',
            trend: 0.3,
            variants: [{ size: '25 bags', unit: 'box', mrp: 180, v: 4, pack: 24 }],
          },
          {
            name: 'Green Label Filter Coffee',
            brand: 'Bru',
            season: 'winter',
            variants: [
              { size: '500 g', unit: 'pack', mrp: 370, v: 12, pack: 12 },
              { size: '200 g', unit: 'pack', mrp: 150, v: 10, pack: 24 },
            ],
          },
          {
            name: 'Classic Instant Coffee',
            brand: 'Nescafé',
            variants: [{ size: '100 g', unit: 'jar', mrp: 375, v: 6, pack: 12 }],
          },
          {
            name: 'Instant Coffee',
            brand: 'Bru',
            variants: [{ size: '100 g', unit: 'jar', mrp: 310, v: 5, pack: 12 }],
          },
        ],
      },
      {
        name: 'Juices & Soft Drinks',
        code: 'JUI',
        items: [
          {
            name: 'Mango Drink',
            brand: 'Maaza',
            season: 'summer',
            shelf: 180,
            variants: [
              { size: '600 ml', unit: 'bottle', mrp: 40, v: 30, pack: 24 },
              { size: '1.2 L', unit: 'bottle', mrp: 75, v: 10, pack: 12 },
            ],
          },
          {
            name: 'Mango Drink',
            brand: 'Frooti',
            season: 'summer',
            shelf: 180,
            variants: [{ size: '600 ml', unit: 'bottle', mrp: 40, v: 12, pack: 24 }],
          },
          {
            name: 'Fruit Power Mixed Fruit Juice',
            brand: 'Real',
            season: 'summer',
            shelf: 180,
            variants: [{ size: '1 L', unit: 'carton', mrp: 130, v: 8, pack: 12 }],
          },
          {
            name: 'Mixed Fruit Juice',
            brand: 'B Natural',
            season: 'summer',
            shelf: 180,
            variants: [{ size: '1 L', unit: 'carton', mrp: 125, v: 4, pack: 12 }],
          },
          {
            name: '100% Orange Juice',
            brand: 'Tropicana',
            season: 'summer',
            shelf: 180,
            variants: [{ size: '1 L', unit: 'carton', mrp: 140, v: 4, pack: 12 }],
          },
          {
            name: 'Soft Drink',
            brand: 'Coca-Cola',
            season: 'summer',
            shelf: 240,
            variants: [
              { size: '750 ml', unit: 'bottle', mrp: 40, v: 14, pack: 24 },
              { size: '2 L', unit: 'bottle', mrp: 100, v: 12, pack: 9 },
            ],
          },
          {
            name: 'Soft Drink',
            brand: 'Thums Up',
            season: 'summer',
            shelf: 240,
            variants: [
              { size: '750 ml', unit: 'bottle', mrp: 40, v: 14, pack: 24 },
              { size: '2 L', unit: 'bottle', mrp: 100, v: 10, pack: 9 },
            ],
          },
          {
            name: 'Lime Soft Drink',
            brand: 'Sprite',
            season: 'summer',
            shelf: 240,
            variants: [{ size: '750 ml', unit: 'bottle', mrp: 40, v: 12, pack: 24 }],
          },
          {
            name: 'Energy Drink',
            brand: 'Red Bull',
            trend: 0.2,
            shelf: 300,
            variants: [{ size: '250 ml', unit: 'can', mrp: 125, v: 5, pack: 24 }],
          },
          {
            name: 'Activ Coconut Water',
            brand: 'Real',
            season: 'summer',
            trend: 0.18,
            shelf: 180,
            variants: [{ size: '200 ml', unit: 'carton', mrp: 50, v: 8, pack: 24 }],
          },
          {
            name: 'Packaged Drinking Water',
            brand: 'Bisleri',
            season: 'summer',
            variants: [
              { size: '1 L', unit: 'bottle', mrp: 20, v: 80, pack: 12 },
              { size: '20 L', unit: 'can', mrp: 90, v: 18, pack: 1 },
            ],
          },
        ],
      },
      {
        name: 'Health Drinks',
        code: 'HLT',
        items: [
          {
            name: 'Health Drink',
            brand: 'Boost',
            variants: [{ size: '500 g', unit: 'jar', mrp: 299, v: 7, pack: 12 }],
          },
          {
            name: 'Classic Malt',
            brand: 'Horlicks',
            trend: -0.12,
            variants: [{ size: '500 g', unit: 'jar', mrp: 299, v: 6, pack: 12 }],
          },
          {
            name: 'Chocolate Health Drink',
            brand: 'Bournvita',
            variants: [{ size: '500 g', unit: 'jar', mrp: 245, v: 5, pack: 12 }],
          },
          {
            name: 'Badam Drink Mix',
            brand: 'MTR',
            variants: [{ size: '200 g', unit: 'jar', mrp: 125, v: 3, pack: 12 }],
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
    discount: [0.04, 0.07],
    margin: [0.04, 0.07],
    weekly: 'fresh',
    shelf: 10,
    description: 'Milk, curd, butter, cheese, paneer, batter and frozen foods.',
    supplier: 'KDA',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Milk & Curd',
        code: 'MLK',
        items: [
          {
            name: 'Toned Milk',
            brand: 'Aavin',
            shelf: 3,
            variants: [{ size: '500 ml', unit: 'pouch', mrp: 22, v: 150, pack: 20 }],
          },
          {
            name: 'Full Cream Milk',
            brand: 'Aavin',
            shelf: 3,
            variants: [{ size: '500 ml', unit: 'pouch', mrp: 30, v: 40, pack: 20 }],
          },
          {
            name: 'Toned Milk',
            brand: 'Arokya',
            shelf: 3,
            variants: [
              { size: '500 ml', unit: 'pouch', mrp: 28, v: 50, pack: 20 },
              { size: '1 L', unit: 'pouch', mrp: 54, v: 20, pack: 12 },
            ],
          },
          {
            name: 'Curd',
            brand: 'Aavin',
            shelf: 10,
            variants: [{ size: '500 g', unit: 'pouch', mrp: 32, v: 30, pack: 20 }],
          },
          {
            name: 'Set Curd',
            brand: 'Milky Mist',
            shelf: 10,
            variants: [{ size: '400 g', unit: 'tub', mrp: 45, v: 15, pack: 12 }],
          },
          {
            name: 'Masti Spiced Buttermilk',
            brand: 'Amul',
            season: 'summer',
            shelf: 7,
            variants: [{ size: '200 ml', unit: 'pouch', mrp: 15, v: 35, pack: 30 }],
          },
          {
            name: 'Kool Kesar Milk',
            brand: 'Amul',
            season: 'summer',
            shelf: 180,
            variants: [{ size: '180 ml', unit: 'bottle', mrp: 25, v: 15, pack: 24 }],
          },
          {
            name: 'Natural Greek Yogurt',
            brand: 'Epigamia',
            trend: 0.3,
            shelf: 21,
            variants: [{ size: '90 g', unit: 'tub', mrp: 50, v: 5, pack: 12, noMdu: true }],
          },
        ],
      },
      {
        name: 'Butter, Cheese & Paneer',
        code: 'CHS',
        items: [
          {
            name: 'Butter',
            brand: 'Amul',
            groups: ['bakery'],
            shelf: 180,
            variants: [
              { size: '100 g', unit: 'pack', mrp: 62, v: 18, pack: 20 },
              { size: '500 g', unit: 'pack', mrp: 290, v: 5, pack: 10 },
            ],
          },
          {
            name: 'Cheese Slices',
            brand: 'Amul',
            shelf: 180,
            trend: 0.15,
            variants: [{ size: '200 g', unit: 'pack', mrp: 160, v: 7, pack: 12 }],
          },
          {
            name: 'Pizza Mozzarella Cheese',
            brand: 'Amul',
            trend: 0.18,
            shelf: 120,
            variants: [{ size: '200 g', unit: 'pack', mrp: 130, v: 3, pack: 12 }],
          },
          {
            name: 'Paneer',
            brand: 'Milky Mist',
            shelf: 12,
            variants: [{ size: '200 g', unit: 'pack', mrp: 100, v: 14, pack: 10 }],
          },
          {
            name: 'Malai Paneer',
            brand: 'Amul',
            shelf: 12,
            variants: [{ size: '200 g', unit: 'pack', mrp: 95, v: 6, pack: 10 }],
          },
          {
            name: 'Fresh Cream',
            brand: 'Amul',
            groups: ['sweets_snacks'],
            shelf: 60,
            variants: [{ size: '250 ml', unit: 'carton', mrp: 70, v: 5, pack: 12 }],
          },
        ],
      },
      {
        name: 'Batter & Ready to Cook',
        code: 'RTC',
        items: [
          {
            name: 'Idly & Dosa Batter',
            brand: 'iD',
            shelf: 5,
            variants: [{ size: '1 kg', unit: 'pack', mrp: 95, v: 30, pack: 10 }],
          },
          {
            name: 'Malabar Parota',
            brand: 'iD',
            shelf: 10,
            variants: [{ size: '5 pcs', unit: 'pack', mrp: 75, v: 8, pack: 12 }],
          },
        ],
      },
      {
        name: 'Frozen',
        code: 'FRZ',
        items: [
          {
            name: 'Frozen Green Peas',
            brand: 'Safal',
            shelf: 365,
            variants: [{ size: '500 g', unit: 'pack', mrp: 105, v: 5, pack: 12 }],
          },
          {
            name: 'French Fries',
            brand: 'McCain',
            trend: 0.15,
            shelf: 365,
            variants: [{ size: '420 g', unit: 'pack', mrp: 140, v: 4, pack: 12, noMdu: true }],
          },
          {
            name: 'Vanilla Ice Cream',
            brand: 'Arun',
            season: 'summer',
            shelf: 270,
            variants: [{ size: '1 L', unit: 'tub', mrp: 199, v: 6, pack: 6 }],
          },
          {
            name: 'Vanilla Magic Ice Cream',
            brand: 'Amul',
            season: 'summer',
            shelf: 270,
            variants: [{ size: '1 L', unit: 'tub', mrp: 190, v: 4, pack: 6 }],
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
    discount: [0.1, 0.14],
    margin: [0.07, 0.1],
    weekly: 'fresh',
    groups: ['bakery'],
    description: 'Bread, biscuits, breakfast cereals and instant mixes.',
    supplier: 'SBD',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Bread',
        code: 'BRD',
        items: [
          {
            name: 'White Bread',
            brand: 'Britannia',
            shelf: 5,
            variants: [{ size: '400 g', unit: 'pack', mrp: 45, v: 40, pack: 10 }],
          },
          {
            name: 'Brown Bread',
            brand: 'Britannia',
            shelf: 5,
            trend: 0.12,
            variants: [{ size: '400 g', unit: 'pack', mrp: 55, v: 16, pack: 10 }],
          },
          {
            name: '100% Whole Wheat Bread',
            brand: 'Britannia',
            shelf: 5,
            trend: 0.2,
            variants: [{ size: '450 g', unit: 'pack', mrp: 65, v: 8, pack: 10 }],
          },
        ],
      },
      {
        name: 'Biscuits & Cookies',
        code: 'BIS',
        items: [
          {
            name: 'Original Glucose Biscuits',
            brand: 'Parle-G',
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', mrp: 25, v: 50, pack: 48 }],
          },
          {
            name: 'Marie Gold',
            brand: 'Britannia',
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', mrp: 40, v: 25, pack: 36 }],
          },
          {
            name: 'Milk Bikis',
            brand: 'Britannia',
            shelf: 270,
            variants: [{ size: '200 g', unit: 'pack', mrp: 30, v: 18, pack: 48 }],
          },
          {
            name: 'Good Day Cashew Cookies',
            brand: 'Britannia',
            shelf: 240,
            variants: [{ size: '200 g', unit: 'pack', mrp: 50, v: 15, pack: 36 }],
          },
          {
            name: 'Bourbon',
            brand: 'Britannia',
            shelf: 240,
            variants: [{ size: '150 g', unit: 'pack', mrp: 35, v: 12, pack: 48 }],
          },
          {
            name: 'Original Vanilla Creme Biscuits',
            brand: 'Oreo',
            shelf: 240,
            variants: [
              { size: '120 g', unit: 'pack', mrp: 35, v: 20, pack: 48 },
              { size: '300 g', unit: 'pack', mrp: 100, v: 4, pack: 24 },
            ],
          },
          {
            name: 'Dark Fantasy Choco Fills',
            brand: 'Sunfeast',
            shelf: 240,
            variants: [{ size: '75 g', unit: 'pack', mrp: 40, v: 12, pack: 48 }],
          },
          {
            name: 'Marie Light',
            brand: 'Sunfeast',
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', mrp: 40, v: 10, pack: 36 }],
          },
          {
            name: 'Hide & Seek',
            brand: 'Parle',
            shelf: 240,
            variants: [{ size: '120 g', unit: 'pack', mrp: 35, v: 10, pack: 48 }],
          },
          {
            name: 'Digestive',
            brand: "McVitie's",
            trend: 0.2,
            shelf: 270,
            variants: [{ size: '250 g', unit: 'pack', mrp: 75, v: 7, pack: 24 }],
          },
          {
            name: 'Toastea Premium Bake Rusk',
            brand: 'Britannia',
            shelf: 180,
            variants: [{ size: '300 g', unit: 'pack', mrp: 50, v: 12, pack: 24 }],
          },
        ],
      },
      {
        name: 'Breakfast',
        code: 'BFT',
        items: [
          {
            name: 'Corn Flakes Original',
            brand: "Kellogg's",
            variants: [{ size: '475 g', unit: 'box', mrp: 210, v: 7, pack: 12 }],
          },
          {
            name: 'Chocos',
            brand: "Kellogg's",
            variants: [{ size: '375 g', unit: 'box', mrp: 210, v: 6, pack: 12 }],
          },
          {
            name: 'Muesli Fruit, Nut & Seeds',
            brand: "Kellogg's",
            trend: 0.1,
            variants: [{ size: '500 g', unit: 'box', mrp: 375, v: 2.2, pack: 12, p: 0.55 }],
          },
          {
            name: 'Oats',
            brand: 'Quaker',
            trend: 0.28,
            variants: [{ size: '1 kg', unit: 'pack', mrp: 225, v: 7, pack: 10 }],
          },
          {
            name: 'Oats',
            brand: 'Saffola',
            trend: 0.2,
            variants: [{ size: '1 kg', unit: 'pack', mrp: 210, v: 4, pack: 10 }],
          },
          {
            name: 'Rava Idli Mix',
            brand: 'MTR',
            variants: [{ size: '500 g', unit: 'pack', mrp: 140, v: 6, pack: 20 }],
          },
          {
            name: 'Rava Dosa Mix',
            brand: 'MTR',
            variants: [{ size: '500 g', unit: 'pack', mrp: 135, v: 4, pack: 20 }],
          },
          {
            name: 'Roasted Vermicelli',
            brand: 'Anil',
            groups: ['vermicelli'],
            variants: [{ size: '450 g', unit: 'pack', mrp: 45, v: 10, pack: 20 }],
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
    discount: [0.12, 0.18],
    margin: [0.08, 0.12],
    weekly: 'retail',
    description: 'Bath, hair, oral and skin care.',
    supplier: 'PPC',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Bath & Body',
        code: 'BTH',
        items: [
          {
            name: 'Soap',
            brand: 'Mysore Sandal',
            groups: ['gifting'],
            variants: [{ size: '3 × 125 g', unit: 'pack', mrp: 235, v: 8, pack: 24 }],
          },
          {
            name: 'Classic Ayurvedic Soap',
            brand: 'Medimix',
            variants: [{ size: '4 × 125 g', unit: 'pack', mrp: 185, v: 14, pack: 24 }],
          },
          {
            name: 'Neem, Tulsi & Aloe Vera Soap',
            brand: 'Hamam',
            variants: [{ size: '4 × 100 g', unit: 'pack', mrp: 152, v: 15, pack: 24 }],
          },
          {
            name: 'Total 10 Soap',
            brand: 'Lifebuoy',
            variants: [{ size: '4 × 100 g', unit: 'pack', mrp: 125, v: 14, pack: 24 }],
          },
          {
            name: 'Original Soap',
            brand: 'Dettol',
            variants: [{ size: '4 × 75 g', unit: 'pack', mrp: 150, v: 10, pack: 24 }],
          },
          {
            name: 'Sandal & Turmeric Soap',
            brand: 'Santoor',
            variants: [{ size: '4 × 100 g', unit: 'pack', mrp: 150, v: 12, pack: 24 }],
          },
          {
            name: 'Lime Fresh Soap',
            brand: 'Cinthol',
            variants: [{ size: '4 × 100 g', unit: 'pack', mrp: 150, v: 6, pack: 24 }],
          },
          {
            name: 'Deeply Nourishing Body Wash',
            brand: 'Dove',
            variants: [{ size: '250 ml', unit: 'bottle', mrp: 285, v: 2.4, pack: 12, p: 0.6 }],
          },
          {
            name: 'Cool Talc',
            brand: 'Navratna',
            season: 'summer',
            variants: [{ size: '400 g', unit: 'bottle', mrp: 245, v: 5, pack: 12 }],
          },
          {
            name: 'Original Handwash Refill',
            brand: 'Dettol',
            variants: [{ size: '750 ml', unit: 'pouch', mrp: 125, v: 7, pack: 12 }],
          },
          {
            name: 'Shaving Foam Regular',
            brand: 'Gillette',
            variants: [{ size: '418 g', unit: 'can', mrp: 290, v: 3, pack: 12 }],
          },
          {
            name: 'Ultra Clean XL+ Sanitary Pads',
            brand: 'Whisper',
            variants: [{ size: '15 pads', unit: 'pack', mrp: 199, v: 10, pack: 24 }],
          },
          {
            name: 'Secure XL Sanitary Pads',
            brand: 'Stayfree',
            variants: [{ size: '18 pads', unit: 'pack', mrp: 99, v: 8, pack: 24 }],
          },
          {
            name: 'Extra Moisturizing Baby Soap',
            brand: 'Himalaya',
            variants: [{ size: '75 g', unit: 'pcs', mrp: 60, v: 5, pack: 48 }],
          },
        ],
      },
      {
        name: 'Hair Care',
        code: 'HAR',
        items: [
          {
            name: 'Strength & Shine Shampoo',
            brand: 'Clinic Plus',
            variants: [
              { size: '175 ml', unit: 'bottle', mrp: 125, v: 9, pack: 24 },
              { size: '650 ml', unit: 'bottle', mrp: 380, v: 3, pack: 12 },
            ],
          },
          {
            name: 'Cool Menthol Anti-Dandruff Shampoo',
            brand: 'Head & Shoulders',
            variants: [{ size: '180 ml', unit: 'bottle', mrp: 199, v: 5, pack: 24 }],
          },
          {
            name: 'Black Shine Shampoo',
            brand: 'Sunsilk',
            variants: [{ size: '180 ml', unit: 'bottle', mrp: 150, v: 5, pack: 24 }],
          },
          {
            name: 'Intense Repair Conditioner',
            brand: 'Dove',
            variants: [{ size: '180 ml', unit: 'bottle', mrp: 250, v: 3, pack: 24 }],
          },
          {
            name: '100% Pure Coconut Oil',
            brand: 'Parachute',
            groups: ['coconut'],
            variants: [
              { size: '500 ml', unit: 'bottle', mrp: 165, v: 16, pack: 24 },
              { size: '1 L', unit: 'bottle', mrp: 320, v: 5, pack: 12 },
            ],
          },
          {
            name: 'Amla Hair Oil',
            brand: 'Dabur',
            variants: [{ size: '275 ml', unit: 'bottle', mrp: 155, v: 5, pack: 24 }],
          },
        ],
      },
      {
        name: 'Oral Care',
        code: 'ORL',
        items: [
          {
            name: 'Strong Teeth Toothpaste',
            brand: 'Colgate',
            variants: [
              { size: '200 g', unit: 'tube', mrp: 118, v: 24, pack: 36 },
              { size: '2 × 200 g', unit: 'pack', mrp: 225, v: 8, pack: 24 },
            ],
          },
          {
            name: 'Red Paste',
            brand: 'Dabur',
            variants: [{ size: '200 g', unit: 'tube', mrp: 130, v: 8, pack: 36 }],
          },
          {
            name: 'Red Hot Gel Toothpaste',
            brand: 'Close-Up',
            variants: [{ size: '150 g', unit: 'tube', mrp: 110, v: 6, pack: 36 }],
          },
          {
            name: 'Fresh Mint Toothpaste',
            brand: 'Sensodyne',
            trend: 0.12,
            variants: [{ size: '70 g', unit: 'tube', mrp: 135, v: 4, pack: 36 }],
          },
          {
            name: 'ZigZag Toothbrush',
            brand: 'Colgate',
            variants: [{ size: 'Pack of 4', unit: 'pack', mrp: 120, v: 8, pack: 24 }],
          },
          {
            name: 'Cool Mint Mouthwash',
            brand: 'Listerine',
            trend: 0.15,
            variants: [{ size: '250 ml', unit: 'bottle', mrp: 150, v: 2, pack: 12, p: 0.55 }],
          },
        ],
      },
      {
        name: 'Skin Care',
        code: 'SKN',
        items: [
          {
            name: 'Purifying Neem Face Wash',
            brand: 'Himalaya',
            trend: 0.12,
            variants: [{ size: '100 ml', unit: 'tube', mrp: 175, v: 6, pack: 24 }],
          },
          {
            name: 'Nourishing Body Milk',
            brand: 'Nivea',
            season: 'winter',
            variants: [{ size: '400 ml', unit: 'bottle', mrp: 399, v: 2.6, pack: 12 }],
          },
          {
            name: 'Intensive Care Deep Moisture Lotion',
            brand: 'Vaseline',
            season: 'winter',
            variants: [{ size: '400 ml', unit: 'bottle', mrp: 399, v: 2, pack: 12 }],
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
    discount: [0.12, 0.16],
    margin: [0.07, 0.11],
    weekly: 'retail',
    groups: ['cleaning'],
    description: 'Laundry, dishwash, cleaners, repellents and pooja essentials.',
    supplier: 'KHC',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Laundry',
        code: 'LDY',
        items: [
          {
            name: 'Easy Wash Detergent Powder',
            brand: 'Surf Excel',
            variants: [
              { size: '1 kg', unit: 'pack', mrp: 140, v: 25, pack: 12 },
              { size: '500 g', unit: 'pack', mrp: 72, v: 15, pack: 24 },
            ],
          },
          {
            name: 'Plus Jasmine & Rose Detergent Powder',
            brand: 'Tide',
            variants: [
              { size: '1 kg', unit: 'pack', mrp: 125, v: 12, pack: 12 },
              { size: '4 kg', unit: 'bag', mrp: 480, v: 6, pack: 4 },
            ],
          },
          {
            name: 'Active 2 in 1 Detergent Powder',
            brand: 'Wheel',
            variants: [{ size: '1 kg', unit: 'pack', mrp: 75, v: 10, pack: 12 }],
          },
          {
            name: 'Matic Front Load Liquid Detergent',
            brand: 'Surf Excel',
            trend: 0.22,
            variants: [{ size: '1 L', unit: 'bottle', mrp: 245, v: 8, pack: 12 }],
          },
          {
            name: 'Detergent Bar',
            brand: 'Rin',
            trend: -0.08,
            variants: [{ size: '4 × 250 g', unit: 'pack', mrp: 110, v: 15, pack: 24 }],
          },
          {
            name: 'After Wash Fabric Conditioner',
            brand: 'Comfort',
            variants: [{ size: '860 ml', unit: 'bottle', mrp: 240, v: 3, pack: 12 }],
          },
        ],
      },
      {
        name: 'Dishwash',
        code: 'DSH',
        items: [
          {
            name: 'Dishwash Bar',
            brand: 'Vim',
            variants: [{ size: '3 × 200 g', unit: 'pack', mrp: 65, v: 20, pack: 24 }],
          },
          {
            name: 'Lemon Dishwash Gel',
            brand: 'Vim',
            trend: 0.18,
            variants: [{ size: '750 ml', unit: 'bottle', mrp: 175, v: 9, pack: 12 }],
          },
          {
            name: 'Scrub Pad',
            brand: 'Scotch-Brite',
            variants: [{ size: '3 pcs', unit: 'pack', mrp: 75, v: 14, pack: 48 }],
          },
        ],
      },
      {
        name: 'Cleaners & Repellents',
        code: 'CLN',
        items: [
          {
            name: 'Citrus Floor Cleaner',
            brand: 'Lizol',
            variants: [{ size: '975 ml', unit: 'bottle', mrp: 230, v: 9, pack: 12 }],
          },
          {
            name: 'Power Plus Toilet Cleaner',
            brand: 'Harpic',
            variants: [{ size: '500 ml', unit: 'bottle', mrp: 110, v: 11, pack: 24 }],
          },
          {
            name: 'Glass & Surface Cleaner',
            brand: 'Colin',
            variants: [{ size: '500 ml', unit: 'bottle', mrp: 115, v: 3, pack: 24 }],
          },
          {
            name: 'Gold Flash Liquid Refill',
            brand: 'Good Knight',
            variants: [{ size: '45 ml', unit: 'pcs', mrp: 85, v: 13, pack: 24 }],
          },
          {
            name: 'Ultra Liquid Refill',
            brand: 'All Out',
            variants: [{ size: '45 ml', unit: 'pcs', mrp: 85, v: 6, pack: 24 }],
          },
          {
            name: 'Crawling Insect Killer Spray',
            brand: 'HIT',
            variants: [{ size: '400 ml', unit: 'can', mrp: 250, v: 4, pack: 24 }],
          },
          {
            name: 'Room Freshener Spray',
            brand: 'Godrej aer',
            groups: ['gifting'],
            variants: [{ size: '240 ml', unit: 'can', mrp: 199, v: 3, pack: 24 }],
          },
          {
            name: 'Air Freshener Block',
            brand: 'Odonil',
            variants: [{ size: '50 g', unit: 'pcs', mrp: 55, v: 5, pack: 48, p: 0.7 }],
          },
        ],
      },
      {
        name: 'Pooja Essentials',
        code: 'PJA',
        items: [
          {
            name: '3 in 1 Agarbatti',
            brand: 'Cycle',
            groups: ['puja'],
            variants: [{ size: '100 sticks', unit: 'box', mrp: 75, v: 9, pack: 24 }],
          },
          {
            name: 'Sandal Agarbatti',
            brand: 'Mangaldeep',
            groups: ['puja'],
            variants: [{ size: '100 sticks', unit: 'box', mrp: 60, v: 7, pack: 24 }],
          },
          {
            name: 'Camphor Tablets',
            brand: 'Mangaldeep',
            groups: ['puja'],
            variants: [{ size: '50 g', unit: 'box', mrp: 80, v: 5, pack: 24 }],
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
    discount: [0.12, 0.16],
    margin: [0.07, 0.11],
    weekly: 'retail',
    shelf: 270,
    description: 'Noodles, pasta, sauces, spreads, pickles and ready-to-eat meals.',
    supplier: 'RFA',
    alternates: ['SWM'],
    subcategories: [
      {
        name: 'Noodles & Pasta',
        code: 'NDL',
        items: [
          {
            name: '2-Minute Masala Noodles',
            brand: 'Maggi',
            variants: [
              { size: '70 g', unit: 'pack', mrp: 15, v: 70, pack: 48 },
              { size: '4 × 70 g', unit: 'pack', mrp: 60, v: 24, pack: 24 },
            ],
          },
          {
            name: 'Magic Masala Noodles',
            brand: 'Sunfeast YiPPee!',
            variants: [{ size: '4 × 65 g', unit: 'pack', mrp: 56, v: 14, pack: 24 }],
          },
          {
            name: 'Veg Hakka Noodles',
            brand: "Ching's Secret",
            variants: [{ size: '150 g', unit: 'pack', mrp: 45, v: 8, pack: 30 }],
          },
          {
            name: 'Cup Noodles Mazedaar Masala',
            brand: 'Nissin',
            variants: [{ size: '70 g', unit: 'pcs', mrp: 50, v: 9, pack: 24 }],
          },
          {
            name: 'Penne Rigate Pasta',
            brand: 'Del Monte',
            trend: 0.14,
            variants: [{ size: '500 g', unit: 'pack', mrp: 110, v: 6, pack: 20 }],
          },
          {
            name: 'Elbow Macaroni',
            brand: 'Bambino',
            variants: [{ size: '400 g', unit: 'pack', mrp: 55, v: 4, pack: 20 }],
          },
        ],
      },
      {
        name: 'Sauces & Spreads',
        code: 'SAU',
        items: [
          {
            name: 'Fresh Tomato Ketchup',
            brand: 'Kissan',
            variants: [
              { size: '500 g', unit: 'bottle', mrp: 115, v: 12, pack: 24 },
              { size: '950 g', unit: 'bottle', mrp: 165, v: 4, pack: 12 },
            ],
          },
          {
            name: 'Hot & Sweet Tomato Chilli Sauce',
            brand: 'Maggi',
            variants: [{ size: '500 g', unit: 'bottle', mrp: 135, v: 6, pack: 24 }],
          },
          {
            name: 'Schezwan Chutney',
            brand: "Ching's Secret",
            variants: [{ size: '250 g', unit: 'jar', mrp: 105, v: 6, pack: 24 }],
          },
          {
            name: 'Green Chilli Sauce',
            brand: "Ching's Secret",
            variants: [{ size: '190 g', unit: 'bottle', mrp: 70, v: 6, pack: 24 }],
          },
          {
            name: 'Veg Mayonnaise',
            brand: 'Dr. Oetker FunFoods',
            trend: 0.2,
            variants: [{ size: '250 g', unit: 'jar', mrp: 99, v: 5, pack: 24 }],
          },
          {
            name: 'Crunchy Peanut Butter',
            brand: 'Dr. Oetker FunFoods',
            trend: 0.25,
            variants: [{ size: '340 g', unit: 'jar', mrp: 190, v: 4, pack: 12 }],
          },
          {
            name: 'Mixed Fruit Jam',
            brand: 'Kissan',
            variants: [{ size: '500 g', unit: 'jar', mrp: 185, v: 6, pack: 12 }],
          },
          {
            name: 'Honey',
            brand: 'Dabur',
            variants: [{ size: '500 g', unit: 'jar', mrp: 245, v: 5, pack: 12 }],
          },
          {
            name: 'Hazelnut Spread with Cocoa',
            brand: 'Nutella',
            trend: 0.16,
            variants: [{ size: '350 g', unit: 'jar', mrp: 399, v: 2, pack: 12, p: 0.6 }],
          },
        ],
      },
      {
        name: 'Pickles & Ready to Eat',
        code: 'RTE',
        items: [
          {
            name: 'Mango Pickle',
            brand: 'Aachi',
            variants: [{ size: '300 g', unit: 'jar', mrp: 95, v: 7, pack: 12 }],
          },
          {
            name: 'Lime Pickle',
            brand: "Mother's Recipe",
            variants: [{ size: '400 g', unit: 'jar', mrp: 110, v: 5, pack: 12 }],
          },
          {
            name: 'Ready to Eat Dal Makhani',
            brand: 'MTR',
            variants: [{ size: '300 g', unit: 'pack', mrp: 125, v: 4, pack: 24 }],
          },
          {
            name: 'Ready to Eat Rajma Masala',
            brand: 'MTR',
            variants: [{ size: '300 g', unit: 'pack', mrp: 125, v: 2.2, pack: 24 }],
          },
          {
            name: 'Gulab Jamun Mix',
            brand: 'MTR',
            groups: ['sweets_snacks', 'gifting'],
            variants: [{ size: '175 g', unit: 'box', mrp: 105, v: 3, pack: 24 }],
          },
          {
            name: 'Soya Chunks',
            brand: 'Nutrela',
            variants: [{ size: '200 g', unit: 'pack', mrp: 55, v: 8, pack: 24 }],
          },
          {
            name: 'Custard Powder',
            brand: 'Brown & Polson',
            groups: ['sweets_snacks'],
            variants: [{ size: '100 g', unit: 'box', mrp: 45, v: 4, pack: 24 }],
          },
          {
            name: 'Classic Tomato Soup',
            brand: 'Knorr',
            season: 'winter',
            variants: [{ size: '53 g', unit: 'pack', mrp: 65, v: 5, pack: 24 }],
          },
        ],
      },
    ],
  },
];
