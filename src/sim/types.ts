/**
 * Persistent game state. Everything in GameState is plain JSON-serialisable
 * data and is saved verbatim (see SAVE_SCHEMA.md). Systems are stateless
 * functions/classes operating on this structure.
 */

export type Sex = 'male' | 'female' | 'unknown';
export type FishOrigin = 'starter' | 'supplier' | 'bred' | 'dev';

export interface FishGenes {
  /** Locus -> allele pair. Reserved for the Milestone 2 genetics system. */
  loci: Record<string, [string, string]>;
  /** Heritable quality 0..1 (form, colour intensity). */
  quality: number;
  /** Heritable adult-size multiplier around 1.0. */
  size: number;
}

export interface FishEntity {
  id: string;
  speciesId: string;
  morphId: string;
  sex: Sex;
  /** Age in in-game days. */
  ageDays: number;
  sizeCm: number;
  /** Individual adult size (species adult * sex * genes). */
  adultSizeCm: number;
  health: number; // 0..100
  hunger: number; // 0 full .. 100 starving
  stress: number; // 0..100
  /** Transient extra stress from netting/transport, decays. */
  shock: number;
  genes: FishGenes;
  /** Derived quality 0..1 (genes + condition history). */
  quality: number;
  temperament: number; // -1 timid .. 1 bold
  disease: string | null;
  breedingReadiness: number; // 0..1
  pregnancy: { daysRemaining: number; fryCount: number } | null;
  generation: number;
  parents: { motherId: string | null; fatherId: string | null };
  origin: FishOrigin;
  originDetail: string;
  purchaseCost: number;
  tankId: string | null;
  tankHistory: string[];
  offspringCount: number;
  bornDay: number;
  alive: boolean;
  deathDay: number | null;
  deathCause: string | null;
  /** Customer currently holding this fish for purchase. */
  reservedBy: string | null;
  name: string | null;
  strainName: string | null;
}

export interface WaterState {
  temperature: number;
  ph: number;
  gh: number;
  /** All nitrogen compounds in ppm (mg/L). */
  ammonia: number;
  nitrite: number;
  nitrate: number;
  oxygen: number; // mg/L
  /** Nitrifying bacteria maturity 0..1 (ammonia oxidisers / nitrite oxidisers). */
  aob: number;
  nob: number;
  /** Organic detritus in mg/L equivalent, mineralises into ammonia. */
  detritus: number;
  cloudiness: number; // 0..1
}

export interface DecorItem {
  uid: string;
  defId: string;
  /** Horizontal position 0..1 across the tank. */
  x: number;
  /** 0 back .. 2 front. */
  layer: 0 | 1 | 2;
  flip: boolean;
  health: number; // plants 0..1
}

export interface TankState {
  id: string;
  name: string;
  sizeId: string;
  litres: number;
  lengthCm: number;
  water: WaterState;
  filterId: string;
  filterCondition: number; // 0..1
  heaterId: string | null;
  heaterSetpoint: number;
  heaterBroken: boolean;
  airStone: boolean;
  lightOn: boolean;
  substrateId: string;
  backgroundId: string;
  decor: DecorItem[];
  algae: number; // 0..1
  glassDirt: number; // 0..1
  /** Uneaten food units currently in the water. */
  food: number;
  /** Minutes since last fed (for UI). */
  lastFedMinute: number;
  /** Set while the tank inspection view is open; renderer handles eating. */
  viewActive: boolean;
  /** Last day each maintenance task was done (for UI hints). */
  lastMaintenance: Record<string, number>;
}

export type CustomerGoal = 'browse' | 'buy_specific' | 'advice_stocking' | 'problem';
export type CustomerPhase =
  | 'entering'
  | 'browsing'
  | 'to_queue'
  | 'queueing'
  | 'seeking_help'
  | 'waiting_help'
  | 'leaving'
  | 'gone';

export interface CustomerTraits {
  budget: number;
  experience: number; // 0..1
  patience: number; // 0..1
  negotiation: number; // 0..1
  ethics: number; // 0..1 cares about welfare
  qualityFocus: number; // 0..1
}

export interface BasketLine {
  fishIds: string[];
  speciesId: string;
  unitPrice: number;
}

export interface CustomerState {
  id: string;
  profileId: string;
  name: string;
  archetype: string;
  appearance: number; // seed for sprite palette
  traits: CustomerTraits;
  goal: CustomerGoal;
  goalData: {
    speciesId?: string;
    quantity?: number;
    tankLitres?: number;
    heated?: boolean;
    problemId?: string;
  };
  phase: CustomerPhase;
  x: number;
  y: number;
  path: Array<{ x: number; y: number }>;
  facing: 'up' | 'down' | 'left' | 'right';
  /** Tanks still to browse. */
  browseQueue: string[];
  currentTankId: string | null;
  waitMinutes: number;
  /** Remaining patience minutes before leaving unhappy. */
  patienceLeft: number;
  basket: BasketLine[];
  addOns: string[];
  satisfaction: number; // 0..100
  thought: string | null;
  thoughtUntil: number;
  returning: boolean;
  /** Seconds-equivalent animation phase for walking. */
  walkPhase: number;
  arrivedMinute: number;
  queueIndex: number;
  negotiated: boolean;
}

export interface CustomerProfile {
  id: string;
  name: string;
  archetype: string;
  appearance: number;
  visits: number;
  loyalty: number; // 0..100
  lastVisitDay: number;
  totalSpent: number;
  /** Set when we sold them unsuitable fish; they complain on their next visit. */
  grievance: boolean;
}

export interface SupplierOrderLine {
  speciesId: string;
  quantity: number;
  tankId: string;
  unitCost: number;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  lines: SupplierOrderLine[];
  placedDay: number;
  arrivalDay: number;
  total: number;
}

export interface SupplierStock {
  speciesId: string;
  available: number;
  unitCost: number;
}

export interface SupplierState {
  id: string;
  stock: SupplierStock[];
  lastRefreshDay: number;
}

export type RepDimension =
  | 'quality'
  | 'welfare'
  | 'service'
  | 'cleanliness'
  | 'aquascape'
  | 'value'
  | 'knowledge';

export interface LedgerDay {
  day: number;
  income: number;
  expenses: number;
  fishSold: number;
  customersServed: number;
  customersLost: number;
  deaths: number;
  notes: string[];
}

export interface LogEntry {
  minute: number;
  text: string;
  kind: 'info' | 'good' | 'warn' | 'bad';
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  nextId: number;
  playerName: string;
  shopName: string;
  createdAt: number;
  /** Total in-game minutes since day 1 00:00. */
  minute: number;
  money: number;
  foodUnits: number;
  dryGoods: Record<string, number>;
  prices: Record<string, number>;
  fish: Record<string, FishEntity>;
  tanks: Record<string, TankState>;
  tankOrder: string[];
  customers: CustomerState[];
  profiles: Record<string, CustomerProfile>;
  suppliers: Record<string, SupplierState>;
  orders: SupplierOrder[];
  reputation: Record<RepDimension, number>;
  ledger: LedgerDay[];
  today: LedgerDay;
  log: LogEntry[];
  player: { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right'; floor: string };
  unlocks: { floors: string[]; marine: boolean; species: string[]; equipment: string[] };
  objectives: Record<string, { done: boolean; doneDay: number | null; progress: number }>;
  stats: {
    totalSales: number;
    totalFishSold: number;
    customersServed: number;
    fishBred: number;
    fishDied: number;
    adviceGiven: number;
    goodAdvice: number;
  };
  settings: { speed: number; tutorialSeen: boolean };
  flags: { devUsed: boolean; tutorialStep: number };
  lastCustomerSpawnMinute: number;
}
