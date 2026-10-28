/** Fiction, identities and schedules owned by The Stairwell. No HF runtime. */
export type Rid = 'hacer' | 'sevim' | 'burak' | 'derya' | 'tarik';
export const KAPICI = 'kapici';
export const RIDS: readonly Rid[] = ['hacer', 'sevim', 'burak', 'derya', 'tarik'];

export interface ResidentInfo {
  id: Rid;
  name: string;
  castId: string;
  castRevision: '1' | '2';
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
  hacer: {
    id: 'hacer',
    castId: 'hf.cast.hacer.voice',
    castRevision: '1',
    name: 'Hacer',
    call: 'Ms Hacer',
    flat: 1,
    floor: 0,
    age: 58,
    paper: true,
    single: false,
    blurb: 'She is a retired shop assistant. She is staying by the entrance while handling family business.',
  },
  sevim: {
    id: 'sevim',
    castId: 'hf.cast.sevim.stairwell',
    castRevision: '1',
    name: 'Sevim',
    call: 'Ms Sevim',
    flat: 2,
    floor: 1,
    age: 69,
    paper: true,
    single: false,
    blurb: 'She is a widowed retired teacher and volunteer tutor. She corrects the notices on the board.',
  },
  burak: {
    id: 'burak',
    castId: 'hf.cast.burak.stairwell',
    castRevision: '1',
    name: 'Burak',
    call: 'Mr Burak',
    flat: 3,
    floor: 1,
    age: 31,
    paper: false,
    single: true,
    blurb: 'He is a single accountant. He keeps the shared building account separate from his work.',
    work: [8 * 60 + 30, 18 * 60 + 15],
  },
  derya: {
    id: 'derya',
    castId: 'hf.cast.derya.stairwell',
    castRevision: '2',
    name: 'Derya',
    call: 'Ms Derya',
    flat: 5,
    floor: 2,
    age: 44,
    paper: false,
    single: true,
    blurb: 'She is a night nurse. She sleeps in the mornings.',
    nights: true,
  },
  tarik: {
    id: 'tarik',
    castId: 'hf.cast.tarik.stairwell',
    castRevision: '1',
    name: 'Tarık',
    call: 'Mr Tarık',
    flat: 7,
    floor: 4,
    age: 81,
    paper: true,
    single: false,
    blurb: 'He is a widowed retired ferry captain. He lives on the top floor, and the stairs take effort.',
  },
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
  ring: 'burak:paper_parcel',
  visitor: 'derya:visitor',
  fund: 'fund:short',
  dues: 'tarik:owes',
} as const;
