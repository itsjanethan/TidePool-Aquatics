/**
 * Help and glossary: one definition per symbol, statistic and topic. Every
 * screen that explains something links here (by id) instead of keeping its
 * own wording, so descriptions cannot drift apart.
 */

export type HelpSectionId =
  | 'controls' | 'status' | 'symbols' | 'water' | 'fish' | 'habitat' | 'breeding' | 'plants'
  | 'customers' | 'staff' | 'progression' | 'marine' | 'saving' | 'idle' | 'playtest';

export interface HelpSection {
  id: HelpSectionId;
  title: string;
  intro: string;
}

export interface GlossaryEntry {
  id: string;
  section: HelpSectionId;
  title: string;
  /** Symbol as shown in game (glyph or short text), if any. */
  symbol?: string;
  body: string;
  /** Good / bad ranges where useful. */
  ranges?: string;
  affectedBy?: string[];
  affects?: string[];
}

export const HELP_SECTIONS: HelpSection[] = [
  { id: 'controls', title: 'Controls', intro: 'Keyboard, mouse, touch and gamepad.' },
  { id: 'status', title: 'Tank Status', intro: 'How to read a tank at a glance and find out exactly what is wrong.' },
  { id: 'symbols', title: 'Symbols & Icons', intro: 'Every icon and marker in the game.' },
  { id: 'water', title: 'Water Chemistry', intro: 'What the numbers in a water test mean.' },
  { id: 'fish', title: 'Fish Needs', intro: 'What keeps fish healthy and calm.' },
  { id: 'habitat', title: 'Habitat & Aquascaping', intro: 'Cover, caves, swimming space and substrate in numbers.' },
  { id: 'breeding', title: 'Breeding & Genetics', intro: 'Pairs, fry, traits and strains.' },
  { id: 'plants', title: 'Plants', intro: 'Growth, propagation and floating plants.' },
  { id: 'customers', title: 'Customers', intro: 'Serving, advice and reputation.' },
  { id: 'staff', title: 'Staff', intro: 'Hiring, roles, skills and suggestions.' },
  { id: 'progression', title: 'Shop Progression', intro: 'Shop levels and new floors.' },
  { id: 'marine', title: 'Marine', intro: 'Saltwater basics for the advanced floor.' },
  { id: 'saving', title: 'Saving', intro: 'How and when the game saves.' },
  { id: 'idle', title: 'Idle Mode', intro: 'Watch your shop without running it.' },
  { id: 'playtest', title: 'Playtest & Feedback', intro: 'Reporting bugs and ideas.' },
];

export const GLOSSARY: GlossaryEntry[] = [
  // Controls ---------------------------------------------------------------
  { id: 'controls_move', section: 'controls', title: 'Moving and interacting', body: 'Move with the arrow keys or WASD (d-pad or left stick). Hold B to run in the store (Shift or X on a keyboard, B on a gamepad or on screen); running only speeds up you, never the shop clock. Z, Enter or Space interacts or confirms. X or Backspace goes back. Esc opens the menu. Mouse and touch work in every menu.' },
  { id: 'controls_shortcuts', section: 'controls', title: 'Shortcuts', body: 'H opens Help from anywhere. F feeds the tank you face (or the tank you are viewing). T changes game speed. In menus with long details, Q and E scroll the details.' },
  { id: 'controls_tank', section: 'controls', title: 'In the tank view', body: 'E / Q (or arrows) select the next and previous fish. Z opens the selected fish (or the tank menu when none is selected). R opens Aquascape. X deselects, then leaves the tank.' },

  // Tank status ----------------------------------------------------------------
  { id: 'overall', section: 'status', title: 'Overall status', body: 'Good: nothing needs doing. Needs attention: at least one warning. Urgent: something is hurting fish now (dead fish, toxic water, starving, a crashed temperature). Open the tank to see the reasons at the top of its menu.' },
  { id: 'welfare', section: 'status', title: 'Fish welfare', body: 'Average of fish health and calmness in this tank.', ranges: 'Good above 75%. Below 50% fish are suffering.', affectedBy: ['Water quality', 'Hunger', 'Habitat', 'Tank mates', 'Stocking'], affects: ['Fish welfare reputation', 'Breeding', 'Value'] },
  { id: 'water_quality', section: 'status', title: 'Water score', body: 'A summary of the water: ammonia, nitrite, nitrate, oxygen, clarity, and whether temperature and pH suit the fish present.', ranges: 'Good above 80%.', affectedBy: ['Water changes', 'Filter', 'Feeding', 'Stocking', 'Heater'] },
  { id: 'cleanliness', section: 'status', title: 'Cleanliness', body: 'How clean the tank looks and is: glass, algae, cloudiness and waste in the substrate.', affectedBy: ['Clean glass', 'Scrub algae', 'Vacuum substrate', 'Rinse filter'], affects: ['Customer impression', 'Cleanliness reputation', 'Tank beauty'] },
  { id: 'habitat', section: 'status', title: 'Habitat score', body: 'How well the aquascape meets the needs of the fish present: hiding cover, cave spaces and open swimming space.', affectedBy: ['Aquascape'], affects: ['Stress', 'Breeding', 'Fry survival'] },
  { id: 'stocking', section: 'status', title: 'Stocking', body: 'How much of the tank\'s capacity the fish use. Capacity depends on volume and filter. Bigger fish and messy species use more.', ranges: 'Comfortable under 80%. Over 100% is overcrowded.', affectedBy: ['Number and size of fish', 'Filter rating'], affects: ['Stress', 'Waste build-up'] },
  { id: 'health', section: 'status', title: 'Fish health', body: 'Falls when conditions are wrong (toxins, temperature, hunger, stress) and recovers slowly when they are right. At zero the fish dies.', ranges: 'Healthy above 70%. Poor below 50%.' },

  // Symbols ----------------------------------------------------------------------
  { id: 'icon_attention', section: 'symbols', title: 'Orange ! bubble: needs attention', symbol: '!', body: 'A tank has a warning that is not an emergency yet: habitat, stocking, equipment, pH or a tank that is still cycling. Open the tank: the reason and the fix are at the top of its menu.' },
  { id: 'icon_dead', section: 'symbols', title: 'Grey cross bubble: dead fish', symbol: '✝', body: 'There is a dead fish in the tank. Remove it quickly: it rots into ammonia and upsets customers.' },
  { id: 'icon_toxic', section: 'symbols', title: 'Red ! bubble: harmful water', symbol: '!', body: 'The water itself is harming fish right now: ammonia or nitrite, wrong salinity, or a temperature far outside what the fish need. Water changes are usually the first fix.' },
  { id: 'icon_sick', section: 'symbols', title: 'Pink + bubble: sick fish', symbol: '+', body: 'Fish in this tank are in poor health. The cause is listed in the tank menu; it is often stress, bullying, hunger or old age rather than the water.' },
  { id: 'icon_hungry', section: 'symbols', title: 'Yellow dots bubble: hungry', symbol: '...', body: 'The fish are hungry. Face the tank and press F, or choose Feed.' },
  { id: 'icon_dirty', section: 'symbols', title: 'Green bubble: needs cleaning', symbol: '~', body: 'Glass, algae, waste or cloudiness need attention. The tank menu says which, and shows what each clean-up will change.' },
  { id: 'icon_question', section: 'symbols', title: '? above a customer', symbol: '?', body: 'The customer wants advice. Walk up to them and press Z.' },
  { id: 'icon_basket', section: 'symbols', title: '"n waiting" by the till', symbol: '£', body: 'Customers are queueing to pay. Stand behind the counter facing the front of the queue and press Z, or let a Sales member of staff serve them.' },
  { id: 'icon_staff', section: 'symbols', title: 'Blue polo and name tag: staff', symbol: '▣', body: 'Staff wear the blue shop polo with their name underneath. Face them and press Z to see what they are doing. When one walks up to you with a speech bubble, they have a suggestion for you to approve.' },
  { id: 'cycled', section: 'symbols', title: 'CYCLED / CYCLING / UNCYCLED', body: 'Whether the filter bacteria are established. Only add fish to cycled tanks.' },
  { id: 'sex', section: 'symbols', title: '♂ and ♀', symbol: '♂ ♀', body: 'Male and female. Many species only show their colours or long fins once mature.' },
  { id: 'stars', section: 'symbols', title: 'Quality stars', symbol: '★', body: 'Heritable quality of a fish: colour intensity, finnage and form. Better quality fish sell for more and pass it on.' },
  { id: 'severity', section: 'symbols', title: '!! ⚠ · in tank reports', body: '!! urgent, ⚠ warning, · advice (worth doing, not harming fish yet).' },
  { id: 'idle_badge', section: 'symbols', title: 'IDLE MODE badge', body: 'The business is paused. Nothing is bought, sold or simulated until you choose Resume Business.' },

  // Water ------------------------------------------------------------------------
  { id: 'ammonia', section: 'water', title: 'Ammonia', body: 'Fish waste, rotting food and dead fish release ammonia. It burns gills and is the most dangerous everyday toxin.', ranges: '0 ppm is right. 0.25+ harms fish. 0.5+ is an emergency.', affectedBy: ['Water changes (lower)', 'Mature filter bacteria (lower)', 'Overfeeding and overstocking (raise)', 'Dead fish (raise)'], affects: ['Stress', 'Health', 'Deaths'] },
  { id: 'nitrite', section: 'water', title: 'Nitrite', body: 'Bacteria turn ammonia into nitrite, then other bacteria turn nitrite into nitrate. Nitrite stops blood carrying oxygen.', ranges: '0 ppm is right. 0.25+ harms fish.', affectedBy: ['Water changes', 'Mature filter'], affects: ['Stress', 'Health'] },
  { id: 'nitrate', section: 'water', title: 'Nitrate', body: 'The end product of the nitrogen cycle. Much less toxic than ammonia or nitrite, but it builds up and wears fish down over time and feeds algae.', ranges: 'Under 40 ppm is good. Over 60 is high. Over 100 is harmful.', affectedBy: ['Water changes', 'Plants', 'Floating plants'], affects: ['Long-term health', 'Algae'] },
  { id: 'cycle', section: 'water', title: 'The nitrogen cycle', body: 'A new tank has no bacteria. Ammonia rises, then nitrite, then both fall as bacteria grow (about two to four weeks). Add fish slowly to new tanks; bacteria starter speeds it up.' },
  { id: 'ph', section: 'water', title: 'pH', body: 'How acidic or alkaline the water is. Each species has a range. Wood lowers pH slightly; limestone raises it.', ranges: 'Most community fish: 6.5 to 7.8.' },
  { id: 'gh', section: 'water', title: 'GH (hardness)', body: 'Dissolved minerals. Livebearers like harder water; neons and many soft-water fish prefer it soft.' },
  { id: 'temperature', section: 'water', title: 'Temperature', body: 'Tropical fish need a heater set inside their range. Coldwater and temperate fish should not be kept warm. Unheated tanks follow the room temperature, which changes with the seasons.', affects: ['Stress', 'Oxygen', 'Breeding'] },
  { id: 'oxygen', section: 'water', title: 'Oxygen', body: 'Warm water holds less oxygen; many fish and a still surface use it up. Fish gasp at the surface when it is low.', ranges: 'Good above 6 mg/L. Under 5 is a problem.', affectedBy: ['Air stone', 'Filter surface movement', 'Temperature', 'Stocking'] },
  { id: 'cloudiness', section: 'water', title: 'Cloudiness', body: 'Milky water: usually a bacterial bloom in a new tank, or stirred-up waste.', affectedBy: ['Filter (clears it)', 'Vacuuming'] },
  { id: 'waste', section: 'water', title: 'Waste in the substrate', body: 'Fish waste and uneaten food settle into the gravel and rot into ammonia. Vacuuming removes about 70% and replaces 10% of the water.' },
  { id: 'filter', section: 'water', title: 'Filter condition', body: 'Filters clog with muck over time and move less water, so bacteria process less waste and water clears slowly. Rinsing the media in tank water restores flow and keeps the bacteria.', ranges: 'Rinse below about 50%.' },
  { id: 'glass', section: 'water', title: 'Glass dirt', body: 'Film and algae on the glass. Cleaning restores it to 100% clean and also removes some algae.', affects: ['Customer impression', 'Tank beauty'] },
  { id: 'algae', section: 'water', title: 'Algae', body: 'Grows with light and nitrate. Scrubbing removes about three quarters. Plants, floating plants, algae-eating fish and water changes slow it down.' },

  // Fish -------------------------------------------------------------------------
  { id: 'stress', section: 'fish', title: 'Fish stress', body: 'Each fish feels stress from its surroundings: water, hunger, tank mates, crowding and habitat. A fish card lists what bothers it most.', ranges: 'Calm under 30. Stressed over 50.', affects: ['Health', 'Breeding', 'Colour'] },
  { id: 'hunger', section: 'fish', title: 'Hunger and feeding', body: 'Fish get hungry a few points an hour, faster in warm water. A normal feed is what they will finish; leftovers rot into ammonia.' },
  { id: 'groups', section: 'fish', title: 'Groups and shoals', body: 'Shoaling fish feel safe in numbers. Each species shows its minimum group size.' },
  { id: 'compatibility', section: 'fish', title: 'Compatibility', body: 'Big fish eat small ones, fin nippers chase long-finned fish, coldwater and tropical fish need different temperatures, and freshwater and marine fish can never share water.' },
  { id: 'not_for_sale', section: 'fish', title: 'Not for sale', body: 'Mark a fish not for sale (fish details, or Livestock > Select fish) to keep it: customers cannot reserve or buy it, staff will not sell it and the trade buyer will not take it. If a customer had it in their basket, it comes out. Feeding, moving and breeding are unaffected, and its fry are for sale as usual.' },
  { id: 'quality', section: 'fish', title: 'Fish quality', body: 'Inherited: colour intensity, fin size and form. Shown as stars. Selective breeding slowly raises it.' },

  // Habitat ----------------------------------------------------------------------
  { id: 'cover', section: 'habitat', title: 'Hiding cover', body: 'How much of the tank gives fish somewhere to hide: plants (more as they grow), wood, caves and floating plants. Each species has a recommended amount; the shyest species in the tank sets the target.', ranges: 'Bold fish want 15 to 30%. Shy fish like neons and plecos want 50 to 60%.', affects: ['Stress in shy fish', 'Fry survival'] },
  { id: 'caves', section: 'habitat', title: 'Cave spaces', body: 'Cave-dwelling fish each want a cave of their own. Each cave object has a number of spaces: a clay cave or coconut hut holds 1, a slate stack or holey limestone 2.', affects: ['Stress', 'Territory fights', 'Cave spawning'] },
  { id: 'openspace', section: 'habitat', title: 'Open swimming space', body: 'Clear water for active swimmers. Big decor fills it. Danios and goldfish want a lot.' },
  { id: 'substrate', section: 'habitat', title: 'Substrate', body: 'Sand suits bottom sifters like corydoras. Planted soil makes rooted plants grow faster. Gravel is a good all-rounder.' },
  { id: 'wood', section: 'habitat', title: 'Wood', body: 'Plecos rasp wood as part of their diet. Wood also stains the water a little amber and lowers pH slightly.' },
  { id: 'aquascape_score', section: 'habitat', title: 'Aquascape score', body: 'How good the layout looks: variety, balance, plant health, layering and cleanliness. Feeds the Aquascaping reputation and customer impressions.' },

  // Breeding ---------------------------------------------------------------------
  { id: 'breeding_readiness', section: 'breeding', title: 'Breeding readiness', body: 'Builds up over days of good food, health and calm. Mature, ready adults of both sexes breed in their own way (livebearers give birth; egg layers spawn).' },
  { id: 'fry', section: 'breeding', title: 'Fry', body: 'Baby fish. Adults eat them unless there is plenty of cover; moving fry to their own tank saves more. They grow into adults and show their parents\' traits.' },
  { id: 'genetics', section: 'breeding', title: 'Traits and genetics', body: 'Each fish carries two copies of each trait gene. Dominant traits show with one copy; recessive traits (like albino) only with two. Some guppy tail traits only show on adult males. A fish\'s look comes from its genes, so breeders can spot promising young fish by eye.' },
  { id: 'strains', section: 'breeding', title: 'Strains', body: 'From the F2 generation, a shop-bred line whose parents share its look can be named. Strain fish are worth more, and the name carries through the line.' },

  // Plants -----------------------------------------------------------------------
  { id: 'plant_growth', section: 'plants', title: 'Plant growth', body: 'Plants grow with light and nitrate, faster in planted soil. Stages: cutting, juvenile, established, mature, overgrown. Overgrown plants shade the tank.' },
  { id: 'propagation', section: 'plants', title: 'Propagation', body: 'Take cuttings, runners, rhizome pieces or clumps (depending on species) from bigger plants. Bigger pieces are worth more but set the parent back further.' },
  { id: 'floating', section: 'plants', title: 'Floating plants', body: 'Duckweed, frogbit and red root floaters spread across the surface on their own. They soak up nitrate and give fry cover, but a carpet shades out the plants below. Scoop them from the Plants menu.' },

  // Customers ----------------------------------------------------------------------
  { id: 'serving', section: 'customers', title: 'Serving', body: 'Customers queue at the till. Stand behind the counter facing them and press Z. Good advice and fair prices build reputation.' },
  { id: 'reputation', section: 'customers', title: 'Reputation', body: 'Seven parts (quality, welfare, service, cleanliness, aquascaping, value, advice) shown together as stars. More stars bring more customers.' },

  // Staff --------------------------------------------------------------------------
  { id: 'staff_skills', section: 'staff', title: 'Staff skills', body: 'Cleaning: how thorough their maintenance is. Service: how happy customers are with them. Speed: how fast they walk and work. Knowledge: how good their advice and suggestions are. Skills grow slowly with experience in their role.' },
  { id: 'staff_roles', section: 'staff', title: 'Staff roles', body: 'Sales: serves the till and answers questions. Maintenance: fixes the most urgent tank problems first. Stock: watches tanks and demand and suggests orders. Floater: does whatever is most needed.' },
  { id: 'staff_suggestions', section: 'staff', title: 'Suggestions', body: 'Staff walk up to you with ideas: orders, aquascape changes. Nothing is bought without your approval. Knowledgeable staff make good suggestions; beginners sometimes make plausible but poor ones, so check the preview.' },
  { id: 'wages', section: 'staff', title: 'Wages', body: 'Paid every night with the rent. Better staff cost more.' },

  // Progression ----------------------------------------------------------------------
  { id: 'shop_levels', section: 'progression', title: 'Shop levels', body: 'Level 1 Starter Aquatics (ground floor). Level 2 Coldwater & Temperate (first floor). Level 3 Advanced Aquatics & Marine (second floor). Level 4 Basement Warehouse & Equipment. Each needs reputation, customers served and capital. See Shop Progression at the office PC.' },

  // Marine --------------------------------------------------------------------------
  { id: 'salinity', section: 'marine', title: 'Salinity', body: 'How salty marine water is, in parts per thousand (ppt), also shown as specific gravity (SG). Water evaporates but salt does not, so salinity creeps up: top up with fresh RO water, never salt water.', ranges: 'Fish-only marine: 33 to 35 ppt (SG 1.024 to 1.026).' },
  { id: 'live_rock', section: 'marine', title: 'Live rock', body: 'Porous rock full of bacteria. The main biological filter of a marine tank and hiding places for fish.' },
  { id: 'skimmer', section: 'marine', title: 'Protein skimmer', body: 'Foams waste out of marine water before it rots, keeping nitrate and cloudiness down.' },
  { id: 'ro_water', section: 'marine', title: 'RO top-off water', body: 'Purified fresh water used to replace evaporation in marine tanks. Tap water adds unwanted minerals.' },

  // Saving --------------------------------------------------------------------------
  { id: 'saving', section: 'saving', title: 'Saving', body: 'Save, load, export and import at the office PC. The game autosaves every morning when the shop opens. Saves live in this browser; export a copy to move to another device.' },

  // Idle ------------------------------------------------------------------------------
  { id: 'idle_mode', section: 'idle', title: 'Idle Mode', body: 'An observation mode for watching your fish and showing the shop to others. The business is paused: the clock, water, hunger, growth, breeding, customers, wages and deliveries all stop. Fish, plants and water keep animating. You can walk between floors, view tanks, inspect fish, genetics and strains, read diagnostics and help. Buying, selling, ordering, maintenance and staff actions are disabled. Enter from the pause menu or office PC; choose Resume Business to carry on exactly where you left off.' },
  { id: 'idle_tank', section: 'idle', title: 'Watching a tank', body: 'In Idle Mode the tank view hides its buttons after a few seconds. Press any key or move the mouse to bring them back, or use Hide UI.' },

  // Playtest ----------------------------------------------------------------------------
  { id: 'playtest_report', section: 'playtest', title: 'Reporting a problem', body: 'Use Copy Playtest Report in the pause menu. It copies the game version, day, floor, money and recent messages (no personal data) so you can paste it into a message with what happened.' },
];

const BY_ID = new Map(GLOSSARY.map((g) => [g.id, g]));

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

export function entriesFor(section: HelpSectionId): GlossaryEntry[] {
  return GLOSSARY.filter((g) => g.section === section);
}
