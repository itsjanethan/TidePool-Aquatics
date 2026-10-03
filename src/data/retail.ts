/**
 * Equipment retail (basement). Items are bought in at wholesale, take up
 * stock space and sell to equipment-seeking customers. Bundles cost a little
 * more to buy in but carry a better margin than the parts sold separately.
 */
export type RetailCategory = 'tank' | 'filter' | 'heater' | 'air' | 'lighting' | 'substrate' | 'maintenance' | 'marine' | 'bundle';

export interface RetailItemDef {
  id: string;
  name: string;
  category: RetailCategory;
  wholesale: number;
  retail: number;
  /** Stock space used per item. */
  space: number;
  description: string;
  /** Bundles: the parts, for display and for customers who want one of them. */
  contains?: string[];
  /** Bundles: consumables included in the box (display only). */
  extras?: string[];
}

export const RETAIL_ITEMS: RetailItemDef[] = [
  { id: 'tank_40', name: '40L Tank', category: 'tank', wholesale: 22, retail: 45, space: 4, description: 'Glass tank with lid. Fine for a small tropical community; too small for goldfish.' },
  { id: 'tank_60', name: '60L Tank', category: 'tank', wholesale: 34, retail: 69, space: 5, description: 'The classic community tank size.' },
  { id: 'tank_120', name: '120L Tank', category: 'tank', wholesale: 70, retail: 139, space: 8, description: 'Room for a cory group, or a pair of fancy goldfish.' },
  { id: 'filter_sponge', name: 'Sponge Filter', category: 'filter', wholesale: 5, retail: 12, space: 1, description: 'Gentle, cheap and fry-safe. Up to 60L. Needs an air pump.' },
  { id: 'filter_hob', name: 'Hang-on Filter', category: 'filter', wholesale: 18, retail: 39, space: 2, description: 'Strong mechanical filtration for up to 120L.' },
  { id: 'filter_canister', name: 'Canister Filter', category: 'filter', wholesale: 52, retail: 109, space: 3, description: 'Big, quiet filtration for 120 to 300L and messy fish like goldfish.' },
  { id: 'filter_media', name: 'Filter Media Pack', category: 'filter', wholesale: 3, retail: 7.5, space: 1, description: 'Replacement sponges and ceramic rings. Rinse, do not replace all at once.' },
  { id: 'heater_50', name: '50W Heater', category: 'heater', wholesale: 8, retail: 19, space: 1, description: 'For tanks up to 60L.' },
  { id: 'heater_150', name: '150W Heater', category: 'heater', wholesale: 14, retail: 32, space: 1, description: 'For tanks from 60 to 150L.' },
  { id: 'air_pump', name: 'Air Pump', category: 'air', wholesale: 7, retail: 16, space: 1, description: 'Runs sponge filters and air stones. Low running cost.' },
  { id: 'air_stone', name: 'Air Stone & Tubing', category: 'air', wholesale: 0.6, retail: 2.5, space: 1, description: 'More surface movement and oxygen.' },
  { id: 'light_led', name: 'LED Light Bar', category: 'lighting', wholesale: 16, retail: 36, space: 1, description: 'Plant-friendly light with a sunrise timer.' },
  { id: 'gravel_bag', name: 'Gravel (10kg)', category: 'substrate', wholesale: 4, retail: 9.5, space: 2, description: 'Natural gravel for a 60L tank.' },
  { id: 'soil_bag', name: 'Planted Soil (8L)', category: 'substrate', wholesale: 9, retail: 19, space: 2, description: 'Nutrient-rich substrate that helps rooted plants grow.' },
  { id: 'net', name: 'Fish Net', category: 'maintenance', wholesale: 1, retail: 3.5, space: 1, description: 'Every keeper needs one.' },
  { id: 'gravel_vac', name: 'Gravel Vacuum', category: 'maintenance', wholesale: 5, retail: 12, space: 1, description: 'Water changes and substrate cleaning in one.' },
  { id: 'skimmer', name: 'Protein Skimmer', category: 'marine', wholesale: 60, retail: 129, space: 3, description: 'Strips waste out of marine water before it rots.' },
  { id: 'ro_unit', name: 'RO Unit', category: 'marine', wholesale: 75, retail: 159, space: 3, description: 'Makes pure water at home for marine top-ups.' },
  { id: 'refractometer', name: 'Refractometer', category: 'marine', wholesale: 14, retail: 34, space: 1, description: 'Measures salinity accurately.' },
  {
    id: 'bundle_tropical40', name: '40L Tropical Starter', category: 'bundle', wholesale: 38, retail: 85, space: 5,
    description: 'Everything for a first small tropical tank, plus water conditioner and food.',
    contains: ['tank_40', 'filter_sponge', 'air_pump', 'heater_50'], extras: ['Water conditioner', 'Flake food'],
  },
  {
    id: 'bundle_starter', name: '60L Community Starter', category: 'bundle', wholesale: 56, retail: 129, space: 6,
    description: '60L tank, sponge filter and pump, 50W heater and LED light, plus conditioner and food.',
    contains: ['tank_60', 'filter_sponge', 'air_pump', 'heater_50', 'light_led'], extras: ['Water conditioner', 'Flake food'],
  },
  {
    id: 'bundle_planted', name: 'Planted Tank Starter', category: 'bundle', wholesale: 72, retail: 159, space: 7,
    description: '60L tank, hang-on filter, 50W heater, LED light and planted soil for a green tank.',
    contains: ['tank_60', 'filter_hob', 'heater_50', 'light_led', 'soil_bag'], extras: ['Liquid fertiliser'],
  },
  {
    id: 'bundle_coldwater', name: 'Coldwater Setup (120L)', category: 'bundle', wholesale: 112, retail: 239, space: 11,
    description: 'A goldfish-sized 120L tank with canister filtration and an air stone. No bowls, no heater needed.',
    contains: ['tank_120', 'filter_canister', 'air_pump', 'air_stone'], extras: ['Water conditioner'],
  },
  {
    id: 'bundle_community', name: 'Community Kit (120L)', category: 'bundle', wholesale: 98, retail: 219, space: 10,
    description: '120L tank, hang-on filter, 150W heater and LED light.',
    contains: ['tank_120', 'filter_hob', 'heater_150', 'light_led'],
  },
  {
    id: 'bundle_marine', name: 'Marine Starter', category: 'bundle', wholesale: 140, retail: 299, space: 10,
    description: '60L tank, skimmer, 50W heater, LED light and refractometer for a fish-only marine tank, plus salt mix.',
    contains: ['tank_60', 'skimmer', 'heater_50', 'light_led', 'refractometer'], extras: ['Marine salt mix'],
  },
];

const BY_ID = new Map(RETAIL_ITEMS.map((r) => [r.id, r]));

export function getRetailItem(id: string): RetailItemDef {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`Unknown retail item: ${id}`);
  return r;
}

/** Stock space without and with the basement warehouse. */
export const BASE_STOCK_SPACE = 40;
export const BASEMENT_STOCK_SPACE = 240;

/** What equipment customers come in for (item ids), with weights. */
export const EQUIPMENT_WANTS: Array<{ items: string[]; weight: number; story: string }> = [
  { items: ['filter_sponge', 'air_pump'], weight: 1.5, story: 'My filter died last night.' },
  { items: ['filter_hob'], weight: 1.2, story: 'I\'ve just bought a 60L tank. What filter should I get?' },
  { items: ['heater_150'], weight: 1.4, story: 'I need a heater for my 100L tank.' },
  { items: ['heater_50'], weight: 1.4, story: 'My heater stopped working.' },
  { items: ['air_pump', 'air_stone'], weight: 1.2, story: 'My air pump has died.' },
  { items: ['tank_40', 'filter_sponge', 'heater_50'], weight: 1.5, story: 'I want to set up my first tropical tank.' },
  { items: ['tank_60', 'filter_sponge', 'heater_50'], weight: 1.5, story: 'Setting up a community tank!' },
  { items: ['tank_60', 'light_led', 'soil_bag'], weight: 0.8, story: 'I want a planted tank.' },
  { items: ['tank_120', 'filter_canister'], weight: 0.7, story: 'My goldfish has outgrown its tank.' },
  { items: ['light_led'], weight: 1, story: 'I want my plants to grow.' },
  { items: ['filter_media', 'gravel_vac'], weight: 1, story: 'Just need some maintenance bits.' },
  { items: ['net'], weight: 0.6, story: 'Lost my net. Need a new one.' },
  { items: ['skimmer', 'refractometer'], weight: 0.6, story: 'Thinking about going marine.' },
];
