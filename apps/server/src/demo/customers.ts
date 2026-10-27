/** The distributor's customers: stores, wholesalers and online grocers across Tamil Nadu (all invented). */

export interface CustomerDef {
  code: string;
  name: string;
  type: 'RETAIL' | 'WHOLESALE' | 'ONLINE';
  city: string;
  /** Warehouse that serves the customer ('*' = any). */
  warehouse: string;
  email: string;
  gstin: string | null;
}

/** Towns each warehouse serves, weighted towards the big cities by repetition. */
const TOWNS: Record<string, string[]> = {
  CHN: [
    'Chennai',
    'Tambaram',
    'Chennai',
    'Avadi',
    'Kanchipuram',
    'Chennai',
    'Chengalpattu',
    'Tiruvallur',
    'Chennai',
    'Vellore',
    'Ranipet',
    'Chennai',
    'Tiruvannamalai',
    'Villupuram',
    'Chennai',
    'Cuddalore',
    'Arakkonam',
    'Chidambaram',
    'Chennai',
    'Gudiyatham',
  ],
  CBE: [
    'Coimbatore',
    'Tiruppur',
    'Erode',
    'Coimbatore',
    'Salem',
    'Pollachi',
    'Namakkal',
    'Coimbatore',
    'Karur',
    'Mettupalayam',
    'Salem',
    'Udhagamandalam',
    'Gobichettipalayam',
    'Coimbatore',
    'Hosur',
    'Dharmapuri',
    'Krishnagiri',
    'Attur',
  ],
  MDU: [
    'Madurai',
    'Tiruchirappalli',
    'Dindigul',
    'Madurai',
    'Thanjavur',
    'Tirunelveli',
    'Virudhunagar',
    'Madurai',
    'Thoothukudi',
    'Kumbakonam',
    'Sivakasi',
    'Nagercoil',
    'Madurai',
    'Karaikudi',
    'Theni',
    'Pudukkottai',
    'Ramanathapuram',
    'Rajapalayam',
  ],
};

const STORE_NAMES = [
  'Sri Murugan',
  'Annai',
  'Sri Balaji',
  'Selvam',
  'Kumaran',
  'Ponni',
  'Vetri',
  'Thangam',
  'Arasan',
  'Malar',
  'Vaigai',
  'Thamarai',
  'Sakthi',
  'Amman',
  'Ayyanar',
  'Meenakshi',
  'Kamatchi',
  'Velavan',
  'Arul',
  'Thirumalai',
  'Senthil',
  'Pandian',
  'Sri Andal',
  'Kalaivani',
  'Mahalakshmi',
  'Sri Venkateswara',
  'Anbu',
  'Inba',
  'Nalla',
  'Puthiya',
  'Raja',
  'Sundaram',
  'Palani Andavar',
  'Muthu',
  'Jothi',
  'Deepam',
  'Kannan',
  'Om Muruga',
  'Bharathi',
  'Kalyani',
  'Chellam',
  'Valli',
  'Ezhil',
  'Kayal',
  'Nila',
  'Mullai',
  'Marutham',
  'Kurinji',
  'Pothigai',
  'Sri Vinayaga',
  'Ganapathy',
  'Sri Ranganatha',
  'Thiruvalluvar',
  'Bharani',
  'Revathi',
  'Sivasakthi',
  'Lakshmi Narayana',
  'Gomathi',
  'Annapoorani',
  'Sri Devi',
  'Subham',
  'Mangalam',
  'Thendral',
  'Vasantham',
  'Uzhavan',
  'Kanmani',
  'Abirami',
  'Karpagam',
  'Sri Rajarajeswari',
  'Vel Murugan',
  'Arunachala',
  'Sri Kamakshi',
  'Ambika',
  'Thirumurugan',
  'Kaliamman',
];

const STORE_KINDS = [
  'Stores',
  'Supermarket',
  'Departmental Store',
  'Provisions',
  'Maligai',
  'Mini Mart',
  'Super Market',
  'Fresh Mart',
  'General Stores',
  'Daily Needs',
];

/** Wholesale buyers, each in its home town. */
const WHOLESALERS: Array<[name: string, city: string, warehouse: string]> = [
  ['Chettinad Wholesale Traders', 'Karaikudi', 'MDU'],
  ['Perumal & Sons', 'Madurai', 'MDU'],
  ['Nellai Agencies', 'Tirunelveli', 'MDU'],
  ['Thanjai Traders', 'Thanjavur', 'MDU'],
  ['Meenakshi Wholesale Mart', 'Madurai', 'MDU'],
  ['Sivakami Agencies', 'Sivakasi', 'MDU'],
  ['Kumbakonam Commercial Corporation', 'Kumbakonam', 'MDU'],
  ['Muthu Trading Company', 'Tiruchirappalli', 'MDU'],
  ['Pearl City Distributors', 'Thoothukudi', 'MDU'],
  ['Kumari Enterprises', 'Nagercoil', 'MDU'],
  ['Kongu Agencies', 'Erode', 'CBE'],
  ['Kovai Wholesale Bazaar', 'Coimbatore', 'CBE'],
  ['Shanmuga Traders', 'Tiruppur', 'CBE'],
  ['Salem Provision Traders', 'Salem', 'CBE'],
  ['Rathinam & Co.', 'Coimbatore', 'CBE'],
  ['Karur Ponnusamy Agencies', 'Karur', 'CBE'],
  ['Nilgiri Hill Traders', 'Udhagamandalam', 'CBE'],
  ['Duraisamy Enterprises', 'Namakkal', 'CBE'],
  ['Hosur Wholesale Mart', 'Hosur', 'CBE'],
  ['Pollachi Trading Company', 'Pollachi', 'CBE'],
  ['Annamalai Wholesale Traders', 'Tiruvannamalai', 'CHN'],
  ['Pallava Agencies', 'Kanchipuram', 'CHN'],
  ['Mahalakshmi Enterprises', 'Chennai', 'CHN'],
  ['Sri Vari Agencies', 'Chennai', 'CHN'],
  ['Natarajan & Sons', 'Chidambaram', 'CHN'],
  ['Vellore Fort Traders', 'Vellore', 'CHN'],
  ['Kathir Distributors', 'Chennai', 'CHN'],
  ['Arcot Wholesale Mart', 'Ranipet', 'CHN'],
  ['Subramaniam Trading Company', 'Cuddalore', 'CHN'],
  ['Ilango Agencies', 'Villupuram', 'CHN'],
  ['Valliammal Enterprises', 'Chengalpattu', 'CHN'],
  ['Ganesan Wholesale Traders', 'Tambaram', 'CHN'],
  ['Chola Mandalam Traders', 'Chennai', 'CHN'],
  ['Ramanathan & Co.', 'Tiruvallur', 'CHN'],
  ['Karuppasamy Agencies', 'Dindigul', 'MDU'],
  ['Rajapalayam Trading Company', 'Rajapalayam', 'MDU'],
  ['Pudukkottai Commercial Corporation', 'Pudukkottai', 'MDU'],
  ['Bhavani Agencies', 'Gobichettipalayam', 'CBE'],
  ['Dharmapuri Wholesale Traders', 'Dharmapuri', 'CBE'],
  ['Marina Provision Traders', 'Chennai', 'CHN'],
];

/** Online grocers, served from whichever warehouse is nearest the order. */
const ONLINE: Array<[name: string, city: string]> = [
  ['Namma Kadai Online', 'Chennai'],
  ['Chennai Fresh Cart', 'Chennai'],
  ['Thinam Fresh', 'Chennai'],
  ['Kovai Kart', 'Coimbatore'],
  ['Pasumai Organics Online', 'Coimbatore'],
  ['Veedu Basket', 'Salem'],
  ['Madurai Daily Basket', 'Madurai'],
  ['Sandhai Direct', 'Madurai'],
  ['Vaangu Online', 'Tiruchirappalli'],
  ['Kadai Express', 'Tirunelveli'],
];

/** Retail stores per warehouse (roughly its share of demand). */
const STORES_PER_WAREHOUSE: Record<string, number> = { CHN: 68, CBE: 45, MDU: 37 };

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A well-formed Tamil Nadu GSTIN: state code 33, a firm's PAN (4th letter F, 5th the name's initial), 1Z, check. */
function gstin(name: string, n: number) {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const pick = (k: number) => letters[k % letters.length] ?? 'A';
  const initial = /[A-Z]/.exec(name.toUpperCase())?.[0] ?? 'K';
  const pan = `A${pick(n)}${pick(n * 7 + 3)}F${initial}${1000 + ((n * 7919) % 9000)}${pick(n * 13 + 5)}`;
  return `33${pan}1Z${(n % 9) + 1}`;
}

export function buildCustomers(): CustomerDef[] {
  const customers: CustomerDef[] = [];
  let storeIndex = 0;
  for (const [wh, count] of Object.entries(STORES_PER_WAREHOUSE)) {
    const towns = TOWNS[wh] ?? ['Chennai'];
    for (let i = 0; i < count; i++, storeIndex++) {
      // Each name appears twice, with different kinds of store, so every name is unique.
      const base = STORE_NAMES[storeIndex % STORE_NAMES.length] ?? 'Sri Murugan';
      const round = Math.floor(storeIndex / STORE_NAMES.length);
      const kind = STORE_KINDS[(storeIndex + round * 3) % STORE_KINDS.length] ?? 'Stores';
      const name = `${base} ${kind}`;
      customers.push({
        code: `C-R${String(storeIndex + 1).padStart(3, '0')}`,
        name,
        type: 'RETAIL',
        city: towns[i % towns.length] ?? 'Chennai',
        warehouse: wh,
        email: `orders@${slug(name)}.example`,
        gstin: null,
      });
    }
  }
  WHOLESALERS.forEach(([name, city, warehouse], i) => {
    customers.push({
      code: `C-W${String(i + 1).padStart(3, '0')}`,
      name,
      type: 'WHOLESALE',
      city,
      warehouse,
      email: `purchase@${slug(name)}.example`,
      gstin: gstin(name, i + 11),
    });
  });
  ONLINE.forEach(([name, city], i) => {
    customers.push({
      code: `C-O${String(i + 1).padStart(3, '0')}`,
      name,
      type: 'ONLINE',
      city,
      warehouse: '*',
      email: `sourcing@${slug(name)}.example`,
      gstin: gstin(name, i + 61),
    });
  });
  return customers;
}
