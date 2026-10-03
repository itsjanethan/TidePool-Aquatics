/**
 * Persistent game state. Everything in GameState is plain JSON-serialisable
 * data and is saved verbatim (see SAVE_SCHEMA.md). Systems are stateless
 * functions/classes operating on this structure.
 */

export type Sex = 'male' | 'female' | 'unknown';

/** A named breeding line created by the player. */
export interface Strain {
  id: string;
  name: string;
  speciesId: string;
  morphId: string;
  foundedDay: number;
  bestGeneration: number;
}

/** Eggs (or a guarded spawn) developing in a tank. */
export interface Brood {
  id: string;
  speciesId: string;
  motherId: string;
  fatherId: string;
  count: number;
  /** In-game days until hatching. */
  daysLeft: number;
  laidDay: number;
}
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
  pregnancy: { daysRemaining: number; fryCount: number; fatherId?: string } | null;
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
  /** Marine tanks: salinity in ppt (35 ppt ≈ SG 1.026). Absent for freshwater. */
  salinity?: number;
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
  /** Plants: growth size (1 = mature). Hardscape: always 1. */
  size: number;
}

/** A loose plant in the shop (cutting or uprooted plant), for planting or sale. */
export interface PottedPlant {
  uid: string;
  defId: string;
  size: number;
  health: number;
  reservedBy: string | null;
}

export interface ShopStorage {
  /** Hardscape items in the stockroom by decor id. */
  decor: Record<string, number>;
  plants: PottedPlant[];
  /** Floating plant portions by floating-plant id. */
  floating?: Record<string, number>;
}

export interface TankState {
  id: string;
  name: string;
  sizeId: string;
  litres: number;
  lengthCm: number;
  /** Floating plant surface coverage by floating-plant id (0..1 each, total <= 1). */
  floating?: Record<string, number>;
  /** Absent means freshwater (all tanks until marine arrives). */
  waterType?: 'freshwater' | 'brackish' | 'marine';
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
  /** Substrates and backgrounds bought for this tank (switching back is free). */
  ownedSubstrates: string[];
  ownedBackgrounds: string[];
  /** Egg clutches developing in this tank. */
  broods?: Brood[];
  /** False for breeding, grow-out or display tanks customers may not buy from. */
  forSale?: boolean;
  /** Marine: protein skimmer installed. */
  skimmer?: boolean;
}

export type CustomerGoal = 'browse' | 'buy_specific' | 'advice_stocking' | 'problem' | 'buy_equipment';
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
  /** Potted plants this customer is buying. */
  plantUids: string[];
  satisfaction: number; // 0..100
  thought: string | null;
  thoughtUntil: number;
  returning: boolean;
  /** Seconds-equivalent animation phase for walking. */
  walkPhase: number;
  arrivedMinute: number;
  queueIndex: number;
  negotiated: boolean;
  /** Floor the customer is on (save v3; absent = ground). */
  floor?: string;
  /** Final destination when walking via stairs to another floor. */
  pending?: { floor: string; x: number; y: number } | null;
  /** Equipment wanted (goal buy_equipment). */
  wants?: string[];
  /** Retail equipment picked up (item ids), paid at the till. */
  equipment?: string[];
  /** Equipment customer has already asked for advice this visit. */
  askedAdvice?: boolean;
  /** Staff member currently helping this customer. */
  helpedBy?: string | null;
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

// ---------------------------------------------------------------------------
// Staff (save v3)

export type StaffRole = 'sales' | 'maintenance' | 'stock' | 'floater';
export type Personality = 'meticulous' | 'chatty' | 'speedy' | 'scholar' | 'steady' | 'eager';

/** Skills 0..100. */
export interface StaffSkills {
  cleaning: number;
  service: number;
  speed: number;
  knowledge: number;
}

export interface StaffTask {
  kind: 'maintain' | 'serve' | 'advise' | 'restock' | 'propose' | 'walk' | 'break' | 'idle';
  tankId?: string;
  fix?: string;
  customerId?: string;
  proposalId?: string;
  /** Destination floor and tile. */
  floor?: string;
  x?: number;
  y?: number;
  /** Game minute when the current step finishes. */
  until?: number;
  /** Short description for the UI ("Cleaning glass on Tank A2"). */
  label: string;
}

export interface StaffEntity {
  id: string;
  name: string;
  appearance: number;
  personality: Personality;
  /** Wage per working day, £. */
  wage: number;
  /** Experience points; skills grow slowly with practice. */
  experience: number;
  floor: string;
  x: number;
  y: number;
  path: Array<{ x: number; y: number }>;
  /** Stairs hop still to make on the way to another floor. */
  pending?: { floor: string; x: number; y: number } | null;
  facing: 'up' | 'down' | 'left' | 'right';
  walkPhase: number;
  role: StaffRole;
  /** Floor they work on (null or absent = anywhere). Optional within save v3. */
  assignedFloor?: string | null;
  task: StaffTask | null;
  skills: StaffSkills;
  hiredDay: number;
  /** Speech bubble text. */
  dialogue: string | null;
  dialogueUntil: number;
  stats: { tasksDone: number; customersHelped: number; proposals: number; sales: number };
}

/** An applicant offered at the PC (not yet hired). */
export interface StaffApplicant {
  id: string;
  name: string;
  appearance: number;
  personality: Personality;
  skills: StaffSkills;
  wage: number;
  intro: string;
}

export type ProposalKind = 'stock' | 'aquascape';
export type ProposalStatus = 'pending' | 'approved' | 'declined' | 'snoozed';

/** A recommendation a staff member brings to the player for approval. */
export interface StaffProposal {
  id: string;
  staffId: string;
  kind: ProposalKind;
  createdMinute: number;
  status: ProposalStatus;
  /** Snoozed proposals come back after this minute. */
  snoozeUntil?: number;
  /** Delivered in person (staff walked over); otherwise waits at the PC. */
  delivered: boolean;
  title: string;
  reason: string;
  warnings: string[];
  stock?: { speciesId: string; quantity: number; supplierId: string; tankId: string; unitCost: number };
  aquascape?: { tankId: string; defId: string; x: number; layer: 0 | 1 | 2; cost: number; fixes: string };
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
  storage: ShopStorage;
  /** Player-named breeding lines. */
  strains?: Record<string, Strain>;
  /** Demand per species (1 = normal); selling many lowers it, it recovers daily. */
  demand?: Record<string, number>;
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
    plantsSold?: number;
    fryEaten?: number;
  };
  settings: { speed: number; tutorialSeen: boolean };
  flags: { devUsed: boolean; tutorialStep: number };
  lastCustomerSpawnMinute: number;
  /**
   * Idle Mode (runtime only, never saved): persistent simulation is paused
   * and economic actions are refused. See sim/idle.ts.
   */
  idle?: boolean;
  /** Employees (save v3). */
  staff: StaffEntity[];
  /** Applicants at the PC, refreshed every few days (save v3). */
  applicants: { day: number; list: StaffApplicant[] };
  /** Staff recommendations awaiting a decision (save v3). */
  proposals: StaffProposal[];
  /** Shop level 1..4 (save v3). */
  shopLevel: number;
  /** Retail equipment stock by item id (save v3). Dry goods stay in dryGoods. */
  retail: Record<string, number>;
  /** Most recent save of this game (added in save v1, optional). */
  lastSave?: { slot: string; minute: number; at: number };
}
