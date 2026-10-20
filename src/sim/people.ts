/**
 * The residents of Lale Apartmanı and the kapıcı, as HF people. Who they are lives in each PersonSpec, a few seeded
 * ties and beliefs, and their trust in the new kapıcı's word. The game reads them back through HF (converse, perceive,
 * credence, decide, predict) and keeps no parallel model of their minds.
 *
 * Source trust (how much a person believes what someone tells them) is authored through HF's `seedSourceTrust`.
 * Legacy self-source beliefs remain for stairwell@3 replay compatibility (docs/hf-requests.md, 7).
 */
import {
  createPerson,
  MINUTES_PER_YEAR,
  type Person,
  REPUTATION_TRAITS,
  seedSourceTrust,
  seedTie,
  type TraitEffect,
} from '@adam0white/human-framework';

export type Rid = 'nermin' | 'sevim' | 'burak' | 'huseyin' | 'derya' | 'elif' | 'tarik';
export const KAPICI = 'kapici';
export const RIDS: readonly Rid[] = ['nermin', 'sevim', 'burak', 'huseyin', 'derya', 'elif', 'tarik'];

export interface ResidentInfo {
  id: Rid;
  name: string;
  /** How the kapıcı addresses them. */
  call: string;
  flat: number;
  floor: number;
  age: number;
  /** One line for the door. */
  blurb: string;
  /** Takes a newspaper. */
  paper: boolean;
  /** Single, so "sweet on" talk can be about them. */
  single: boolean;
  /** Works away during the day: [leave, return] minute of day, weekdays. */
  work?: [number, number];
  /** Works nights: home asleep in the morning. */
  nights?: boolean;
}

export const RESIDENTS: Record<Rid, ResidentInfo> = {
  nermin: {
    id: 'nermin',
    name: 'Nermin',
    call: 'Nermin Hanım',
    flat: 1,
    floor: 0,
    age: 72,
    paper: true,
    single: false,
    blurb: 'Widow. Her window is next to the front door.',
  },
  sevim: {
    id: 'sevim',
    name: 'Sevim',
    call: 'Sevim Hanım',
    flat: 2,
    floor: 1,
    age: 69,
    paper: true,
    single: false,
    blurb: 'Retired teacher. Corrects the notices on the board.',
  },
  burak: {
    id: 'burak',
    name: 'Burak',
    call: 'Burak Bey',
    flat: 3,
    floor: 1,
    age: 31,
    paper: false,
    single: true,
    blurb: 'Accountant. Polite, quiet, out all day.',
    work: [8 * 60 + 30, 18 * 60 + 15],
  },
  huseyin: {
    id: 'huseyin',
    name: 'Hüseyin',
    call: 'Hüseyin Bey',
    flat: 4,
    floor: 2,
    age: 63,
    paper: true,
    single: false,
    blurb: 'The building manager. Keeps the fund book.',
  },
  derya: {
    id: 'derya',
    name: 'Derya',
    call: 'Derya Hanım',
    flat: 5,
    floor: 2,
    age: 44,
    paper: false,
    single: true,
    blurb: 'Night nurse. Sleeps in the mornings.',
    nights: true,
  },
  elif: {
    id: 'elif',
    name: 'Elif',
    call: 'Elif Hanım',
    flat: 6,
    floor: 3,
    age: 27,
    paper: false,
    single: true,
    blurb: 'Illustrator. Moved in last month.',
  },
  tarik: {
    id: 'tarik',
    name: 'Tarık',
    call: 'Tarık Bey',
    flat: 7,
    floor: 4,
    age: 81,
    paper: true,
    single: false,
    blurb: 'Retired ferry captain. Top floor.',
  },
};

/** The building's character vocabulary: HF's reputation traits plus two of its own. */
export const TRAITS: Record<string, TraitEffect> = {
  ...REPUTATION_TRAITS,
  nosy: { affection: -0.03, trust: -0.03, respect: -0.03 },
  /** '<a>:sweet:<b>': talk about who likes whom. Neutral to the subject's standing. */
  sweet: { affection: 0, trust: 0, respect: 0 },
};

/** What the player may make up about someone: domestic and reversible only (no illness, debt, affair or faith). */
export const INVENTABLE = [
  'stingy',
  'nosy',
  'lazy',
  'unreliable',
  'kind',
  'generous',
  'hardworking',
] as const;
export type Inventable = (typeof INVENTABLE)[number];

/** The building's facts that are not character claims. */
export const FACTS = {
  ring: 'burak:ring',
  visitor: 'derya:visitor',
  fund: 'fund:short',
  dues: 'tarik:owes',
} as const;

const yearsAgo = (now: number, y: number) => now - y * MINUTES_PER_YEAR;

/** Legacy v3 setup: HF seedBelief rejects these self-source observation markers. */
function seedBelief(p: Person, prop: string, value: boolean, cred: number, now: number) {
  const logOdds = Math.log(cred / (1 - cred)) * (value ? 1 : -1);
  p.memory.beliefs.push({ prop, logOdds, updatedAt: now, sources: [{ id: p.id, value }] });
}

export function makeResident(id: Rid, seed: number, now: number): Person {
  const r = RESIDENTS[id];
  const base = {
    id,
    name: r.name,
    now,
    bornAt: yearsAgo(now, r.age),
    voices: [{ voiceId: KAPICI, trust: 0.5 }],
  };
  let p: Person;
  switch (id) {
    case 'nermin':
      p = createPerson({
        ...base,
        seed: seed ^ 0x11,
        sex: 'female',
        traits: { honesty: 0.45, extraversion: 0.85, agreeableness: 0.5, openness: 0.7, emotionality: 0.6 },
        norms: [{ normId: 'backbiting', standing: 'disliked', conviction: 0.3 }],
      });
      break;
    case 'sevim':
      p = createPerson({
        ...base,
        seed: seed ^ 0x22,
        sex: 'female',
        traits: {
          honesty: 0.6,
          extraversion: 0.6,
          agreeableness: 0.35,
          conscientiousness: 0.85,
          openness: 0.4,
        },
        norms: [{ normId: 'backbiting', standing: 'disliked', conviction: 0.4 }],
      });
      break;
    case 'burak':
      p = createPerson({
        ...base,
        seed: seed ^ 0x33,
        sex: 'male',
        traits: {
          honesty: 0.8,
          extraversion: 0.3,
          agreeableness: 0.7,
          conscientiousness: 0.8,
          openness: 0.5,
        },
        norms: [
          { normId: 'backbiting', standing: 'forbidden', conviction: 0.6 },
          { normId: 'lying', standing: 'forbidden', conviction: 0.8 },
        ],
      });
      break;
    case 'huseyin':
      p = createPerson({
        ...base,
        seed: seed ^ 0x44,
        sex: 'male',
        traits: {
          honesty: 0.85,
          extraversion: 0.45,
          agreeableness: 0.35,
          conscientiousness: 0.9,
          openness: 0.3,
        },
        norms: [
          { normId: 'backbiting', standing: 'forbidden', conviction: 0.9 },
          { normId: 'lying', standing: 'forbidden', conviction: 0.85 },
        ],
      });
      break;
    case 'derya':
      p = createPerson({
        ...base,
        seed: seed ^ 0x55,
        sex: 'female',
        traits: { honesty: 0.7, extraversion: 0.35, agreeableness: 0.6, emotionality: 0.5, openness: 0.55 },
        norms: [{ normId: 'backbiting', standing: 'forbidden', conviction: 0.5 }],
      });
      break;
    case 'elif':
      p = createPerson({
        ...base,
        seed: seed ^ 0x66,
        sex: 'female',
        traits: { honesty: 0.65, extraversion: 0.6, agreeableness: 0.65, openness: 0.85, emotionality: 0.55 },
        norms: [{ normId: 'backbiting', standing: 'disliked', conviction: 0.4 }],
      });
      break;
    default:
      p = createPerson({
        ...base,
        seed: seed ^ 0x77,
        sex: 'male',
        traits: {
          honesty: 0.8,
          extraversion: 0.5,
          agreeableness: 0.7,
          conscientiousness: 0.6,
          emotionality: 0.4,
        },
        norms: [{ normId: 'backbiting', standing: 'forbidden', conviction: 0.7 }],
      });
  }
  seedNeighbours(p, now);
  return p;
}

/** Years of living on the same stairs: ties, who believes whom, and what each already thinks. */
function seedNeighbours(p: Person, now: number) {
  const id = p.id as Rid;
  const years: Record<Rid, number> = {
    nermin: 40,
    sevim: 30,
    burak: 3,
    huseyin: 22,
    derya: 8,
    elif: 0.1,
    tarik: 45,
  };
  for (const o of RIDS) {
    if (o === id) continue;
    const known = Math.min(years[id], years[o]);
    const familiarity = Math.min(0.9, known / 30);
    let affection = 0.15 + 0.2 * familiarity;
    if ((id === 'nermin' && o === 'sevim') || (id === 'sevim' && o === 'nermin')) affection = -0.45;
    if ((id === 'nermin' && o === 'tarik') || (id === 'tarik' && o === 'nermin')) affection = 0.6;
    if (id === 'burak' && o === 'elif') affection = 0.45;
    if (id === 'elif' && o === 'burak') affection = 0.25;
    if (id === 'sevim' && o === 'elif') affection = -0.05;
    seedTie(p, { otherId: o, affection, familiarity, trust: 0.45 + 0.3 * familiarity });
    // Neighbours of many years believe each other more; the newcomer's word weighs little yet.
    seedSourceTrust(p, o, o === 'elif' ? 0.45 : Math.min(0.8, 0.5 + 0.3 * familiarity));
  }
  // The feud: each believes the other is nosy. Nermin thinks Hüseyin is stingy; everyone thinks Tarık is kind.
  if (id === 'nermin') {
    seedBelief(p, 'sevim:stingy', true, 0.78, now);
    seedBelief(p, 'huseyin:stingy', true, 0.72, now);
  }
  if (id === 'sevim') {
    seedBelief(p, 'nermin:nosy', true, 0.85, now);
    seedBelief(p, 'elif:lazy', true, 0.62, now);
  }
  if (id === 'huseyin') {
    seedBelief(p, FACTS.dues, true, 0.97, now);
    seedBelief(p, 'notice:water', true, 0.97, now);
  }
  if (id === 'derya') seedBelief(p, 'huseyin:kind', true, 0.7, now);
  if (id !== 'tarik') seedBelief(p, 'tarik:kind', true, 0.8, now);
  // The new kapıcı: a stranger whose word weighs little. Nermin likes a new face; Sevim reserves judgement.
  const word: Record<Rid, number> = {
    nermin: 0.73,
    sevim: 0.48,
    burak: 0.55,
    huseyin: 0.5,
    derya: 0.52,
    elif: 0.62,
    tarik: 0.6,
  };
  seedSourceTrust(p, KAPICI, word[id]);
  seedTie(p, { otherId: KAPICI, affection: 0.05, familiarity: 0.02, trust: 0.5 });
}

/** The kapıcı: an HF person for the body (stairs and legs) and the notebook (what he believes, from whom). */
export function makeKapici(seed: number, now: number): Person {
  const p = createPerson({
    id: KAPICI,
    name: 'Kapıcı',
    now,
    seed: seed ^ 0x99,
    bornAt: yearsAgo(now, 38),
    sex: 'male',
    traits: { honesty: 0.6, extraversion: 0.5 },
    enable: { fatigueStore: true },
  });
  // Rıza Efendi's notebook: what forty years on these stairs taught him, now yours.
  seedBelief(p, 'nermin:nosy', true, 0.8, now);
  seedBelief(p, 'huseyin:stingy', true, 0.72, now);
  seedBelief(p, 'tarik:kind', true, 0.85, now);
  // Hüseyin Bey's notice on the board by your door: the water goes off on Wednesday morning.
  seedBelief(p, 'notice:water', true, 0.95, now);
  for (const r of RIDS) seedSourceTrust(p, r, 0.6);
  return p;
}
