/**
 * Customer archetypes, names, problems and flavour text.
 */
import type { CustomerGoal } from '../sim/types';

export interface ArchetypeDef {
  id: string;
  label: string;
  budget: [number, number];
  experience: [number, number];
  patience: [number, number];
  negotiation: [number, number];
  ethics: [number, number];
  qualityFocus: [number, number];
  goals: Partial<Record<CustomerGoal, number>>;
  /** Species this archetype gravitates toward when browsing (empty = any). */
  favourites: string[];
  /** Typical tank sizes they own (advice requests). */
  tankSizes: number[];
  heatedChance: number;
  weight: number;
  greetings: string[];
  /** Only visits once this floor is open. */
  floor?: string;
  /** Enclosure keepers: the kinds of enclosure they ask advice about. */
  habitats?: Array<'vivarium' | 'terrarium'>;
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'beginner', label: 'New Fishkeeper',
    budget: [18, 50], experience: [0, 0.25], patience: [0.5, 0.9], negotiation: [0, 0.2], ethics: [0.3, 0.7], qualityFocus: [0.1, 0.4],
    goals: { advice_stocking: 0.5, browse: 0.3, problem: 0.2 }, favourites: ['guppy', 'platy', 'molly', 'neon_tetra'],
    tankSizes: [25, 40, 54, 60, 80], heatedChance: 0.65, weight: 3,
    greetings: ['Hi! I am totally new to this.', 'Hello! My first aquarium is set up at home.', 'Um, hi. Can I ask something silly?'],
  },
  {
    id: 'hobbyist', label: 'Hobbyist',
    budget: [25, 75], experience: [0.4, 0.8], patience: [0.4, 0.8], negotiation: [0.1, 0.4], ethics: [0.5, 0.9], qualityFocus: [0.4, 0.7],
    goals: { buy_specific: 0.6, browse: 0.3, advice_stocking: 0.1 }, favourites: [],
    tankSizes: [60, 80, 120, 180], heatedChance: 0.85, weight: 3,
    greetings: ['Afternoon! Just topping up my community tank.', 'Hey, how are the new arrivals looking?'],
  },
  {
    id: 'family', label: 'Family Visit',
    budget: [10, 32], experience: [0, 0.3], patience: [0.25, 0.6], negotiation: [0, 0.3], ethics: [0.3, 0.6], qualityFocus: [0.1, 0.3],
    goals: { browse: 0.6, advice_stocking: 0.3, problem: 0.1 }, favourites: ['fancy_goldfish', 'guppy', 'platy', 'molly'],
    tankSizes: [20, 30, 40, 60], heatedChance: 0.35, weight: 2,
    greetings: ['The kids want a fish. Help!', 'We are just looking. Do not touch the glass, Sam!'],
  },
  {
    id: 'enthusiast', label: 'Enthusiast',
    budget: [50, 140], experience: [0.75, 1], patience: [0.5, 0.9], negotiation: [0.1, 0.35], ethics: [0.75, 1], qualityFocus: [0.75, 1],
    goals: { buy_specific: 0.7, browse: 0.3 }, favourites: ['bristlenose', 'bronze_cory', 'neon_tetra', 'endler'],
    tankSizes: [120, 180, 240], heatedChance: 0.95, weight: 1,
    greetings: ['I only buy healthy, well-kept stock.', 'Let me see what condition your fish are in.'],
  },
  {
    id: 'bargain', label: 'Bargain Hunter',
    budget: [15, 55], experience: [0.2, 0.6], patience: [0.3, 0.6], negotiation: [0.7, 1], ethics: [0.1, 0.5], qualityFocus: [0, 0.3],
    goals: { browse: 0.5, buy_specific: 0.5 }, favourites: [],
    tankSizes: [40, 60, 120], heatedChance: 0.7, weight: 1.5,
    greetings: ['What is your best price today?', 'I saw these cheaper online, you know.'],
  },
  {
    id: 'reef_keeper', label: 'Reef Keeper',
    budget: [60, 180], experience: [0.6, 1], patience: [0.5, 0.9], negotiation: [0.1, 0.4], ethics: [0.7, 1], qualityFocus: [0.6, 1],
    goals: { buy_specific: 0.5, browse: 0.5 }, favourites: ['cleaner_shrimp', 'hermit_crab', 'turbo_snail', 'clownfish', 'cherry_shrimp', 'crystal_shrimp'],
    tankSizes: [60, 120, 200, 300], heatedChance: 1, weight: 1.4, floor: 'reef',
    greetings: ['Any new frags in? My Montipora finally took off.', 'I need a clean-up crew for my nano reef.', 'What are you running your alk at?'],
  },
  {
    id: 'herp_keeper', label: 'Reptile & Amphibian Keeper',
    budget: [50, 160], experience: [0.3, 0.9], patience: [0.5, 0.9], negotiation: [0.1, 0.4], ethics: [0.6, 1], qualityFocus: [0.5, 0.9],
    goals: { buy_specific: 0.45, browse: 0.3, advice_stocking: 0.25 }, favourites: ['dart_frog', 'leopard_gecko', 'crested_gecko', 'rose_tarantula', 'whites_tree_frog', 'fire_bellied_toad'],
    tankSizes: [45, 60, 90, 120, 200], heatedChance: 0.5, weight: 1.6, floor: 'vivarium', habitats: ['vivarium', 'terrarium'],
    greetings: ['Do you have any captive-bred geckos?', 'My vivarium is finally planted. Time for frogs!', 'Is it true tarantulas can live twenty years?'],
  },
];

export const FIRST_NAMES = [
  'Alex', 'Priya', 'Tom', 'Grace', 'Malik', 'Erin', 'Callum', 'Zara', 'Ollie', 'Nadia', 'Hugo', 'Isla', 'Ravi', 'Freya', 'Dev',
  'Ruby', 'Kofi', 'Maeve', 'Jonah', 'Leah', 'Tariq', 'Poppy', 'Sean', 'Amara', 'Finn', 'Hana', 'Rhys', 'Molly', 'Arjun', 'Bea',
  'Ewan', 'Sana', 'Luca', 'Imogen', 'Kai', 'Elsie', 'Omar', 'Tilly', 'Ben', 'Yasmin',
];

export interface ProblemOption {
  text: string;
  correct: boolean;
  /** Dry good the customer buys if the answer is correct. */
  sells?: string;
  reply: string;
}

export interface ProblemDef {
  id: string;
  prompt: string;
  options: ProblemOption[];
}

export const PROBLEMS: ProblemDef[] = [
  {
    id: 'new_tank',
    prompt: 'I set my tank up on Saturday and added ten fish on Sunday. Now some are dying! What did I do wrong?',
    options: [
      { text: 'Your tank is not cycled yet. Do daily water changes and add bacteria starter.', correct: true, sells: 'bacteria', reply: 'Oh! I had no idea it needed time. I will grab some starter.' },
      { text: 'Add a few more fish to balance it out.', correct: false, reply: 'Really? Okay... if you say so.' },
      { text: 'Turn the heater right up.', correct: false, reply: 'Hmm, I will try that I suppose.' },
    ],
  },
  {
    id: 'cloudy',
    prompt: 'My water has gone cloudy and smells a bit. I feed them three big pinches a day, they love it!',
    options: [
      { text: 'Turn the light off for a week.', correct: false, reply: 'Okay, I guess that might help?' },
      { text: 'That is overfeeding. Feed a small pinch once or twice a day and siphon the gravel.', correct: true, sells: 'test_kit', reply: 'Less food, more cleaning. Got it. I will take a test kit too.' },
      { text: 'Add more ornaments to hide the cloudiness.', correct: false, reply: 'Ha, alright.' },
    ],
  },
  {
    id: 'chlorine',
    prompt: 'I filled my tank straight from the tap and the fish look awful. Clamped fins, gasping. Help?',
    options: [
      { text: 'Fish just need a few weeks to settle in.', correct: false, reply: 'I hope you are right...' },
      { text: 'Tap water has chlorine. Always use water conditioner before adding it.', correct: true, sells: 'conditioner', reply: 'Conditioner! That makes sense. I will buy a bottle.' },
      { text: 'Swap to bottled mineral water.', correct: false, reply: 'That sounds expensive, but okay.' },
    ],
  },
  {
    id: 'goldfish_bowl',
    prompt: 'My goldfish lives in a little bowl and keeps gulping at the surface. Is he hungry?',
    options: [
      { text: 'He is struggling for oxygen. Goldfish need a big filtered tank, 100L or more.', correct: true, sells: 'test_kit', reply: 'Wow, that much? I will start saving. And I will test his water meanwhile.' },
      { text: 'Yes, feed him more often.', correct: false, reply: 'More food. Easy!' },
      { text: 'Goldfish are happy in bowls, that is normal.', correct: false, reply: 'Oh good, I was worried.' },
    ],
  },
  {
    id: 'nipped',
    prompt: 'My male guppy has a ragged, shredded tail. He lives with some zebra danios. What is happening?',
    options: [
      { text: 'Danios can nip long fins. Give him a separate tank or a calmer community.', correct: true, sells: 'conditioner', reply: 'Poor guy. I will move him. Need conditioner for the new tank too.' },
      { text: 'He is just old.', correct: false, reply: 'Oh, okay. Nothing to do then.' },
      { text: 'Add salt until the fins grow back.', correct: false, reply: 'How much salt? Never mind, I will figure it out.' },
    ],
  },
];

export const THOUGHTS = {
  lovelyTank: ['What a lovely tank!', 'Ooh, pretty!', 'Beautiful layout.'],
  dirtyTank: ['That glass is filthy.', 'Bit green in there...', 'Murky water. Hmm.'],
  deadFish: ['Is that fish... dead?', 'Yikes, a floater.'],
  sickFish: ['These fish look poorly.', 'They do not look well.'],
  pricey: ['Pricey!', 'Expensive for what it is.'],
  bargain: ['Good price!', 'What a bargain.'],
  outOfStock: ['Out of stock? Shame.', 'None left...'],
  waiting: ['Is anyone serving?', 'Still waiting...', 'Hello?'],
  angry: ['Forget it.', 'Not waiting any longer!'],
  happy: ['Lovely shop!', 'Thanks!', 'Great service.'],
};
