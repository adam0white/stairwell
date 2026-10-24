/**
 * The Stairwell: the building host. Pure and deterministic: state is plain JSON, world draws come from `rng.ts`
 * keyed by day and index, and every player input is stamped with the sim minute it applies at. Replaying the same
 * seed and input log rebuilds the same state (`replay`), which is how the notebook saves and how a playtest export
 * replays.
 *
 * Covers: the kapıcı's day (bread and papers from the bakery, parcels from the courier, small jobs, the bins), his
 * body on the stairs (an HF person with the fatigue store), what he says at each door (HF `told` testimony with his
 * source trust), what residents tell him (`converse`), residents' own free time (HF `decide`: stay in, the front
 * step, the shop, a visit), their talk on the step, the stairs and in each other's flats (`converse`), being caught
 * telling two stories, truths coming out (`confirm` recalibrates every source), three arcs (the paper model, the boiler
 * fund, the late visitor), small pranks (the newspapers, the cat, a parcel at the wrong door), and the Sunday vote
 * on the kapıcı's tea money (each resident's own `decide`).
 * Does not cover: weeks after the first, the residents' meeting seating, weather, residents' families outside.
 */
import {
  type Affordance,
  applyReputationBelief,
  begin,
  bodyForecast,
  confirm,
  converse,
  credence,
  type DecisionRecord,
  decide,
  finish,
  type Outcome,
  type Person,
  perceive,
  predict,
  promise,
  readBody,
  relationshipWith,
  type Suggestion,
  seedSourceTrust,
  socialEvent,
  tick,
  trustOf,
} from '@adam0white/human-framework';
import { applyDeryaReturn, type DeryaContinuity, type DeryaReturnAdmission } from './one-cast.ts';
import {
  FACTS,
  INVENTABLE,
  KAPICI,
  makeKapici,
  makeResident,
  RESIDENTS,
  RIDS,
  type Rid,
  TRAITS,
} from './people.ts';
import { DRAW, hashUnit } from './rng.ts';
import {
  newStories,
  PRIVATE_FACTS,
  PRIVATE_LINES,
  PRIVATE_WORDS,
  STORY_FACTS,
  STORY_LINES,
  STORY_WORDS,
  type StoryState,
} from './stories.ts';

export const LEGACY_GAME_VERSION = 'stairwell@3';
export const PREVIOUS_GAME_VERSION = 'stairwell@4';
export const GAME_VERSION = 'stairwell@6';
export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const LAST_DAY = 6;
export const MEETING = 11 * 60;
const GRATITUDE = 2.5;

export const dayOf = (m: number) => Math.floor(m / 1440) + 1;
export const dayStart = (day: number) => (day - 1) * 1440;
export const clockOf = (m: number) => {
  const t = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// ---------- places ----------

/** Where the kapıcı can be. Doors are `door:<rid>`; landings `landing:<floor>`. */
export type Place = 'room' | 'step' | 'bakery' | 'shop' | 'roof' | `door:${Rid}` | `landing:${number}`;
export const TOP_FLOOR = 4;

export function floorOf(pl: Place): number {
  if (pl === 'roof') return TOP_FLOOR + 1;
  if (pl.startsWith('door:')) return RESIDENTS[pl.slice(5) as Rid].floor;
  if (pl.startsWith('landing:')) return Number(pl.slice(8));
  return 0;
}
const outside = (pl: Place) => pl === 'bakery' || pl === 'shop';
const OUT_MIN: Record<string, number> = { bakery: 6, shop: 4 };

export function placeName(pl: Place): string {
  if (pl === 'room') return 'your room';
  if (pl === 'step') return 'the front step';
  if (pl === 'bakery') return 'the bakery';
  if (pl === 'shop') return 'the corner shop';
  if (pl === 'roof') return 'the roof';
  if (pl.startsWith('door:')) return `flat ${RESIDENTS[pl.slice(5) as Rid].flat}`;
  const f = Number(pl.slice(8));
  return f === 0 ? 'the entrance' : `the floor ${f} landing`;
}

// ---------- state ----------

export type TaskKind = 'bread' | 'paper' | 'parcel' | 'shopping' | 'job' | 'bins';

export interface Task {
  id: number;
  kind: TaskKind;
  /** Whose it is. */
  for: Rid;
  label: string;
  /** Where it is picked up (bread at the bakery, a parcel in your room); none for a job done on the spot. */
  pickup?: Place;
  /** Where it is delivered or done. */
  place: Place;
  /** Minutes of work at the place (jobs). */
  work?: number;
  /** It appears on the board at this minute. */
  from: number;
  /** Wanted by. */
  by: number;
  carried?: boolean;
  done?: number;
  /** Left at the wrong door (a misdelivery) with this resident. */
  wrongDoor?: Rid;
  /** A parcel's label says something: the proposition the kapıcı learns by carrying it. */
  label2?: { prop: string; text: string };
  /** Left on the door hook (nobody answered). */
  hook?: boolean;
}

export type Where = 'home' | 'asleep' | 'step' | 'shop' | 'work' | 'roof' | `visit:${Rid}`;

export interface RState {
  id: Rid;
  where: Where;
  /** Minute the current doing ends (then they decide again). */
  until: number;
  /** Their current HF activity id (offer id). */
  doing: string;
  /** On the stairs between floors until this minute. */
  stairsUntil: number;
  stairsFloors: [number, number];
  /** What the kapıcı told them: the ledger the game uses to catch two stories. */
  told: { prop: string; value: boolean; at: number; lie: boolean }[];
  /** Day of their last treat (börek, a tip for news). */
  treatDay: number;
  /** Day the kapıcı last asked them for news. */
  newsDay: number;
  /** They promised a word for the kapıcı on Sunday. */
  word: 'yes' | 'no' | null;
  /** Caught the kapıcı in two stories (minute), shown in the notebook. */
  caught: number[];
  /** Stories about them that came back to them, with who passed it on; said to the kapıcı at the next meeting. */
  grudges: { prop: string; from: Rid; at: number; lie: boolean; said?: boolean }[];
  vote?: 'yes' | 'no' | 'away';
  /** Times the kapıcı sat a minute with them, and the day he last did. */
  sits: number;
  sitDay: number;
}

export interface Said {
  at: number;
  /** 'narrator' or a resident id (or 'riza' for the old kapıcı's margin notes). */
  who: string;
  text: string;
  kind: 'journal' | 'voice' | 'heard' | 'margin' | 'event';
  /** Running line number. */
  n?: number;
}

export interface Talk {
  at: number;
  a: Rid;
  b: Rid;
  where: string;
  props: string[];
  overheard: boolean;
  caught?: boolean;
}

export interface DayReport {
  day: number;
  tips: number;
  treats: string[];
  done: number;
  late: number;
  missed: number;
  caught: Rid[];
  talks: number;
}

export type Phase = 'day' | 'night' | 'sunday' | 'end';

export interface Kapici {
  at: Place;
  /** Walking: from, to, start and end minute. */
  walk: { from: Place; to: Place; at0: number; at1: number } | null;
  /** Working a job until this minute. */
  busyUntil: number;
  busyTask: number | null;
  money: number;
}

export interface GameState {
  oneCast?: DeryaContinuity;
  /** Present only in v4. Legacy notebooks retain their exact serialized state. */
  stories?: StoryState;
  version: string;
  seed: number;
  minute: number;
  phase: Phase;
  people: Person[];
  kapici: Person;
  k: Kapici;
  residents: RState[];
  tasks: Task[];
  nextTask: number;
  said: Said[];
  talks: Talk[];
  reports: DayReport[];
  /** Secrets the kapıcı has come to know (prop → day learned), for the notebook's secrets page. */
  secrets: Record<string, number>;
  stamps: { id: string; day: number }[];
  /** The courtyard gate is open for the cat until this minute. */
  gateUntil: number;
  /** Cat days: days the stray got in and someone fed it. */
  catDays: number;
  catHome: boolean;
  /** Papers swapped today (the minute). */
  swappedDay: number;
  lunchDay: number;
  boilerBroken: boolean;
  ring: { asked: boolean; answer: 'yes' | 'not yet' | 'no roof' | null; spoiled: boolean };
  derya: { told: boolean; brotherSeen: boolean };
  tarik: { envelope: boolean };
  meeting: { done: boolean; yes: number; no: number; raise: boolean } | null;
  inputs: Input[];
  applied: number;
  /** Lines said so far (never trimmed): varies stock lines and lets a reader find new ones. */
  lineNo: number;
  /** Small jobs already asked this week (index into JOBS): nobody asks for the same bulb twice. */
  jobsUsed: number[];
  /** Times the kapıcı rang Derya's bell while she slept. */
  knocks: number;
}

export type Input =
  | { at: number; kind: 'go'; to: Place }
  | { at: number; kind: 'news'; who: Rid }
  | { at: number; kind: 'tell'; who: Rid; prop: string; value: boolean; sure: boolean }
  | { at: number; kind: 'invent'; who: Rid; about: Rid; trait: string }
  | { at: number; kind: 'word'; who: Rid }
  | { at: number; kind: 'sit'; who: Rid; topic?: 'boundaries' }
  | { at: number; kind: 'misdeliver'; who: Rid; task: number }
  | { at: number; kind: 'knock'; who: Rid }
  | { at: number; kind: 'prank'; what: 'swap' | 'gate' }
  | { at: number; kind: 'next' }
  | { at: number; kind: 'one-cast-depart' };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewInput = DistOmit<Input, 'at'>;

// ---------- helpers ----------

export const personOf = (s: GameState, id: Rid): Person => s.people.find((p) => p.id === id) as Person;
export const rOf = (s: GameState, id: Rid): RState => s.residents.find((r) => r.id === id) as RState;
export const nameOf = (id: string) => (id in RESIDENTS ? RESIDENTS[id as Rid].name : id);
const today = (s: GameState) => dayOf(s.minute);
const tod = (s: GameState) => s.minute - dayStart(today(s));
const weekday = (s: GameState) => today(s); // day 1 = Monday

function say(s: GameState, who: string, text: string, kind: Said['kind'] = 'journal') {
  s.said.push({ at: s.minute, who, text, kind, n: s.lineNo++ });
  if (s.said.length > 1500) s.said.splice(0, s.said.length - 1500);
}

function offer(id: string, over: Partial<Affordance> = {}): Affordance {
  return { id, action: id, label: id, duration: 30, effort: 0.05, advertises: {}, ...over };
}

function stamp(s: GameState, id: string) {
  if (!s.stamps.some((x) => x.id === id)) s.stamps.push({ id, day: today(s) });
}

function learn(s: GameState, prop: string) {
  if (s.secrets[prop] === undefined) s.secrets[prop] = today(s);
}

/** A belief prop in the kapıcı's notebook that counts as one of the building's secrets. */
export const SECRET_PROPS: { prop: string; value: boolean; title: string }[] = [
  { prop: 'hacer:nosy', value: true, title: 'Hacer Hanım sees everyone who passes the door.' },

  { prop: 'tarik:kind', value: true, title: 'Tarık Bey would give you his last lemon candy.' },

  { prop: FACTS.ring, value: true, title: 'A parcel of paper-making supplies came for Burak.' },

  { prop: FACTS.fund, value: true, title: 'The boiler fund is short.' },
  { prop: FACTS.dues, value: true, title: 'Tarık Bey is behind with his dues.' },
  { prop: FACTS.visitor, value: true, title: 'A man comes to Derya’s door late at night.' },
  { prop: 'derya:brother', value: true, title: 'The man is Derya’s brother.' },
];

// ---------- the day plan (pre-rolled from the seed) ----------

function addTask(s: GameState, t: Omit<Task, 'id'>): Task {
  const task = { ...t, id: s.nextTask++ } as Task;
  s.tasks.push(task);
  return task;
}

const JOBS: {
  for: Rid;
  label: string;
  place: Place;
  work: number;
  pickup?: Place;
  kind?: TaskKind;
  window: [number, number];
}[] = [
  {
    for: 'sevim',
    label: 'change the bulb on her landing',
    place: 'landing:1',
    work: 8,
    window: [9 * 60, 14 * 60],
  },
  {
    for: 'tarik',
    label: 'his shopping (bread, olives, tea)',
    pickup: 'shop',
    place: 'door:tarik',
    work: 0,
    kind: 'shopping',
    window: [9 * 60 + 30, 12 * 60 + 30],
  },
  { for: 'burak', label: 'sweep the entrance', place: 'landing:0', work: 15, window: [9 * 60, 12 * 60] },
  {
    for: 'hacer',
    label: 'beat her carpet on the balcony',
    place: 'door:hacer',
    work: 15,
    window: [10 * 60, 16 * 60],
  },
  {
    for: 'hacer',
    label: 'help carry a folding work table',
    place: 'door:hacer',
    work: 12,
    window: [13 * 60, 17 * 60],
  },
  {
    for: 'derya',
    label: 'pick up her pharmacy bag',
    pickup: 'shop',
    place: 'door:derya',
    work: 0,
    kind: 'shopping',
    window: [15 * 60 + 30, 19 * 60],
  },
  {
    for: 'burak',
    label: 'water his plants (key under the mat)',
    place: 'door:burak',
    work: 6,
    window: [10 * 60, 17 * 60],
  },
  { for: 'tarik', label: 'fix his dripping tap', place: 'door:tarik', work: 18, window: [11 * 60, 18 * 60] },
];

export function planDay(s: GameState, day: number) {
  const d = dayStart(day);
  const r = (kind: number, i: number) => hashUnit(s.seed, kind, day, i);
  // Bread and newspapers: everyone wants them early. Derya's hangs on her door while she sleeps.
  for (const [i, id] of RIDS.entries()) {
    if (id === 'burak' && day === 6) continue;
    const loaves = 1 + Math.floor(r(DRAW.bread, i) * 2);
    const by = d + 7 * 60 + 55 + Math.floor(r(DRAW.bread, i + 20) * 35);
    addTask(s, {
      kind: 'bread',
      for: id,
      label: `${loaves === 1 ? 'a loaf' : 'two loaves'}${RESIDENTS[id].paper ? ' and the paper' : ''}`,
      pickup: 'bakery',
      place: `door:${id}`,
      from: d + DAY_START,
      by: id === 'burak' ? d + 8 * 60 + 25 : id === 'derya' ? d + 9 * 60 : by,
    });
  }
  // Parcels: one or two a day, from the courier, into your room.
  const parcels = 1 + (r(DRAW.parcel, 0) < 0.5 ? 1 : 0);
  for (let i = 0; i < parcels; i++) {
    const who = RIDS[Math.floor(r(DRAW.parcel, i + 1) * RIDS.length)] as Rid;
    const at = d + 10 * 60 + Math.floor(r(DRAW.parcelAt, i) * 6 * 60);
    addTask(s, {
      kind: 'parcel',
      for: who,
      label: 'a parcel',
      pickup: 'room',
      place: `door:${who}`,
      from: at,
      by: d + 20 * 60,
    });
  }
  // The paper supplier's parcel, Tuesday.
  if (day === 2)
    addTask(s, {
      kind: 'parcel',
      for: 'burak',
      label: 'a flat, carefully wrapped parcel',
      pickup: 'room',
      place: 'door:burak',
      from: d + 11 * 60 + 10,
      by: d + 20 * 60,
      label2: { prop: FACTS.ring, text: 'The sender’s label says: paper, hinges and card-making supplies.' },
    });
  // Small jobs: two or three, drawn from the list without repeats.
  const n = 2 + (r(DRAW.job, 0) < 0.4 ? 1 : 0);
  const used = new Set<number>();
  for (let i = 0; used.size < n && i < 20; i++) {
    const j = Math.floor(r(DRAW.job, i + 1) * JOBS.length);
    if (used.has(j) || (s.jobsUsed.includes(j) && s.jobsUsed.length < JOBS.length - 2)) continue;
    const job = JOBS[j];
    if (!job) continue;
    if (job.for === 'burak' && day === 6) continue;
    used.add(j);
    s.jobsUsed.push(j);
    const from = d + job.window[0] - 60 + Math.floor(r(DRAW.jobAt, i) * 60);
    addTask(s, {
      kind: job.kind ?? 'job',
      for: job.for,
      label: job.label,
      ...(job.pickup ? { pickup: job.pickup } : {}),
      place: job.place,
      work: job.work,
      from,
      by: d + job.window[1],
    });
  }
  // The bins, every evening: collect from the top landing, out to the street by 20:45.
  addTask(s, {
    kind: 'bins',
    for: 'burak',
    label: 'the bins: down from the top, out by 20:45',
    pickup: `landing:${TOP_FLOOR}`,
    place: 'step',
    from: d + 19 * 60 + 30,
    by: d + 20 * 60 + 45,
  });
  if (day === 3)
    addTask(s, {
      kind: 'job',
      for: 'burak',
      label: 'look at the boiler: no hot water',
      place: 'room',
      work: 20,
      from: d + 7 * 60 + 25,
      by: d + 10 * 60,
    });
}

// ---------- new game ----------

export function newGame(seed: number, edition = GAME_VERSION): GameState {
  if (!canReplay(edition))
    throw new Error(`This notebook belongs to an older edition. Start fresh. (${edition})`);
  const now = DAY_START;
  // Everyone wakes at 06:20 and has breakfast before the day starts.
  const people = RIDS.map((id) => makeResident(id, seed, now - 40));
  const kapici = makeKapici(seed, now - 40);
  for (const p of [...people, kapici]) {
    hostMeal(p, now - 30);
    tick(p, now);
  }
  const s: GameState = {
    version: edition,
    seed,
    minute: now,
    phase: 'day',
    people,
    kapici,
    k: { at: 'room', walk: null, busyUntil: 0, busyTask: null, money: 0 },
    residents: RIDS.map((id) => ({
      id,
      where: RESIDENTS[id].nights ? 'asleep' : 'home',
      until: now + 20 + ((RIDS.indexOf(id) * 7) % 30),
      doing: 'home',
      stairsUntil: 0,
      stairsFloors: [0, 0],
      told: [],
      treatDay: 0,
      newsDay: 0,
      word: null,
      caught: [],
      grudges: [],
      sits: 0,
      sitDay: 0,
    })),
    tasks: [],
    nextTask: 1,
    said: [],
    talks: [],
    reports: [],
    secrets: {},
    stamps: [],
    gateUntil: 0,
    catDays: 0,
    catHome: false,
    swappedDay: 0,
    lunchDay: 0,
    boilerBroken: false,
    ring: { asked: false, answer: null, spoiled: false },
    derya: { told: false, brotherSeen: false },
    tarik: { envelope: false },
    meeting: null,
    inputs: [],
    applied: 0,
    lineNo: 0,
    jobsUsed: [],
    knocks: 0,
  };
  if (edition !== LEGACY_GAME_VERSION) s.stories = newStories();
  if (edition === GAME_VERSION) {
    s.oneCast = { rows: [] };
    const nurse = personOf(s, 'derya');
    const work = offer('derya-night-work', {
      action: 'work',
      label: 'Finish the night shift',
      duration: 60,
      effort: 0.05,
      advertises: {},
    });
    const decision = decide(nurse, [work], { now });
    if (decision.chosenAffordanceId === work.id) begin(nurse, work, decision);
  }
  // Derya is coming home from her night shift.
  const d = rOf(s, 'derya');
  d.where = 'work';
  d.until = now + 60;
  for (const sp of SECRET_PROPS.slice(0, 3)) learn(s, sp.prop);
  planDay(s, 1);
  say(
    s,
    'riza',
    'Bread first, before anything. They all want it by eight, and they all say theirs is first.',
    'margin',
  );
  say(
    s,
    'narrator',
    'Monday. Your first day at Lale Apartmanı. The bread order is on the board, and a notice from Burak Bey: water off Wednesday, ten to twelve.',
    'journal',
  );
  return s;
}

// ---------- the kapıcı's body ----------

/** Minutes per floor going up, from the kapıcı's body now (his legs get slower as the day wears on). */
export function climbMinutes(s: GameState): number {
  const b = readBody(s.kapici);
  const load = s.tasks.filter((t) => t.carried && !t.done).length;
  return round1((0.8 + 0.08 * Math.min(8, load)) / Math.max(0.35, b.capacity) + 0.9 * b.fatigue);
}
const round1 = (x: number) => Math.round(x * 10) / 10;

export function travelMinutes(s: GameState, from: Place, to: Place): number {
  if (from === to) return 0;
  const f0 = floorOf(from);
  const f1 = floorOf(to);
  const up = Math.max(0, f1 - f0);
  const down = Math.max(0, f0 - f1);
  let m = up * climbMinutes(s) + down * 0.5 + 0.5;
  if (outside(from)) m += OUT_MIN[from] ?? 4;
  if (outside(to)) m += OUT_MIN[to] ?? 4;
  if (outside(to) && outside(from)) m -= 3;
  return Math.max(1, Math.round(m));
}

/** The kapıcı's own forecast for a climb to `to` (HF bodyForecast): a line in his voice. */
export function legsLine(s: GameState, to: Place): string {
  const mins = travelMinutes(s, s.k.at, to);
  const floors = Math.max(0, floorOf(to) - floorOf(s.k.at));
  if (floors < 2) return '';
  const aff = offer('climb', { duration: mins, effort: 0.85 });
  aff.followedBy = [{ label: 'the next errands', duration: 120, effort: 0.5 }];
  return bodyForecast(s.kapici, aff).line;
}

function kapiciDoes(s: GameState, id: string, minutes: number, effort: number) {
  const p = s.kapici;
  tick(p, Math.max(p.now, s.minute));
  if (p.activity) {
    const out: Outcome = {
      affordanceId: p.activity.affordanceId,
      action: p.activity.action,
      status: 'completed',
      at: s.minute,
    };
    const t = tod(s);
    if (p.activity.action === 'rest') out.needs = { water: 0.1 };
    // Lunch in your room: the first rest there after noon.
    if (p.activity.action === 'rest' && s.k.at === 'room' && t >= 12 * 60 && s.lunchDay !== today(s)) {
      s.lunchDay = today(s);
      out.needs = { food: 0.6, water: 0.5 };
    }
    finish(p, out);
  }
  const aff = offer(id, {
    duration: Math.max(1, minutes),
    effort,
    advertises: id === 'rest' ? { rest: 0.3 } : {},
  });
  const rec = decide(p, [aff], { now: s.minute });
  if (rec.chosenAffordanceId === aff.id) begin(p, aff, rec);
}

// ---------- residents' free time ----------

function home(r: RState): boolean {
  return r.where === 'home';
}
export const awakeHome = (r: RState) => r.where === 'home';
const atStep = (s: GameState) => s.residents.filter((r) => r.where === 'step').map((r) => r.id);

function freeOffers(s: GameState, r: RState): Affordance[] {
  const t = tod(s);
  const list: Affordance[] = [
    offer('home', {
      action: 'rest',
      label: 'stay in',
      duration: 40,
      advertises: { leisure: 0.12, rest: 0.15 },
    }),
    offer('meal', {
      action: 'eat',
      label: 'eat something',
      duration: 30,
      advertises: { food: 0.5, water: 0.4 },
    }),
  ];
  if (t >= 9 * 60 + 30 && t <= 19 * 60 + 30) {
    const with_ = atStep(s).filter((x) => x !== r.id);
    list.push(
      offer('step', {
        action: 'sit',
        label: 'sit on the front step',
        duration: 35,
        tags: with_.length ? ['social'] : [],
        with: with_,
        advertises: { belonging: with_.length ? 0.22 : 0.08, leisure: 0.18 },
      }),
    );
  }
  if (t >= 8 * 60 + 30 && t <= 19 * 60 + 30)
    list.push(
      offer('shop', {
        action: 'shop',
        label: 'go to the corner shop',
        duration: 30,
        effort: 0.25,
        advertises: { leisure: 0.08, food: 0.05 },
        material: -0.05,
      }),
    );
  if (t >= 10 * 60 && t <= 20 * 60)
    for (const o of s.residents) {
      if (o.id === r.id || !home(o)) continue;
      list.push(
        offer(`visit:${o.id}`, {
          action: 'visit',
          label: `call on ${nameOf(o.id)}`,
          duration: 30,
          tags: ['social'],
          with: [o.id],
          targetId: o.id,
          advertises: { belonging: 0.25, leisure: 0.12 },
        }),
      );
    }
  if ((r.id === 'hacer' || r.id === 'burak') && t >= 16 * 60 && t <= 20 * 60)
    list.push(
      offer('roof', {
        action: 'sit',
        label: 'go up to the roof',
        duration: 30,
        advertises: { leisure: 0.2, beauty: 0.15 } as never,
      }),
    );
  return list;
}

function whereFloor(_s: GameState, w: Where, id: Rid): number {
  if (w === 'roof') return TOP_FLOOR + 1;
  if (w.startsWith('visit:')) return RESIDENTS[w.slice(6) as Rid].floor;
  if (w === 'home' || w === 'asleep') return RESIDENTS[id].floor;
  return 0;
}

/** Move a resident to `w` for `minutes`; they cross the stairs on the way and may meet someone. */
function moveTo(s: GameState, r: RState, w: Where, doing: string, minutes: number) {
  const f0 = whereFloor(s, r.where, r.id);
  const f1 = whereFloor(s, w, r.id);
  const wasStep = r.where === 'step';
  const wasVisit = r.where === w;
  r.where = w;
  r.doing = doing;
  r.until = s.minute + minutes;
  if (f0 !== f1) {
    r.stairsUntil = s.minute + Math.max(1, Math.abs(f1 - f0));
    r.stairsFloors = [Math.min(f0, f1), Math.max(f0, f1)];
    stairsMeet(s, r);
  }
  if (w === 'step' && !wasStep) {
    for (const o of s.residents) if (o.id !== r.id && o.where === 'step') talk(s, r.id, o.id, 'step');
  }
  if (w.startsWith('visit:') && !wasVisit)
    talk(s, r.id, w.slice(6) as Rid, `flat ${RESIDENTS[w.slice(6) as Rid].flat}`);
}

function residentMinute(s: GameState, r: RState) {
  if (r.id === 'derya' && s.oneCast?.departure && !s.oneCast.admission) return;
  const t = tod(s);
  if (s.minute < r.until) return;
  const p = personOf(s, r.id);
  const info = RESIDENTS[r.id];
  tick(p, Math.max(p.now, s.minute));
  if (p.activity) {
    const out: Outcome = {
      affordanceId: p.activity.affordanceId,
      action: p.activity.action,
      status: 'completed',
      at: s.minute,
    };
    if (p.activity.action === 'visit' || (p.activity.action === 'sit' && p.activity.affordanceId === 'step'))
      out.needs = { belonging: 0.12 };
    if (p.activity.action === 'eat') out.needs = { food: 0.5, water: 0.45 };
    if (p.activity.action === 'rest') out.needs = { water: 0.08 };
    if (p.activity.affordanceId === 'derya-night-work')
      out.percepts = [
        {
          at: s.minute,
          channel: 'saw',
          kind: 'night-work',
          actorId: 'derya',
          salience: 1,
          valence: 0.1,
          summary: 'I finished the night shift and came home to flat 5.',
        },
      ];
    finish(p, out);
  }
  // Work and sleep are the host's: the timetable of a working life.
  const wd = weekday(s);
  if (info.work && wd <= 5 && t >= info.work[0] - 1 && t < info.work[1]) {
    moveTo(s, r, 'work', 'work', info.work[1] - t);
    return;
  }
  if (info.nights) {
    if (r.where === 'work' && t < 12 * 60) {
      if (s.version === GAME_VERSION && s.oneCast?.departureRequested && s.minute === 480) {
        pauseDeryaRota(s);
        return;
      }
      moveTo(s, r, 'asleep', 'sleep', 15 * 60 + 30 - t);
      if (s.version === GAME_VERSION) {
        const sleep = offer('derya-day-sleep', {
          action: 'sleep',
          mode: 'sleep',
          duration: 15 * 60 + 30 - t,
          advertises: { sleep: 0.8, rest: 0.5 },
        });
        const rec = decide(p, [sleep], { now: s.minute });
        if (rec.chosenAffordanceId === sleep.id) begin(p, sleep, rec);
      }
      say(s, 'narrator', 'Derya came in from her night shift and went straight up.', 'journal');
      return;
    }
    if (t < 15 * 60) {
      if (s.version === GAME_VERSION && !p.activity) {
        const sleep = offer('derya-day-sleep', {
          action: 'sleep',
          mode: 'sleep',
          duration: 15 * 60 - t,
          advertises: { sleep: 0.8, rest: 0.5 },
        });
        const rec = decide(p, [sleep], { now: s.minute });
        if (rec.chosenAffordanceId === sleep.id) begin(p, sleep, rec);
      }
      r.where = 'asleep';
      r.until = s.minute + (15 * 60 - t);
      return;
    }
    if (wd <= 5 && t >= 19 * 60 + 30) {
      moveTo(s, r, 'work', 'work', DAY_END + 60 - t);
      if (s.version === GAME_VERSION) {
        const work = offer('derya-night-work', {
          action: 'work',
          label: 'Complete the night rota',
          duration: 1440 + 480 - t,
          effort: 0.05,
          advertises: {},
        });
        const rec = decide(p, [work], { now: s.minute });
        if (rec.chosenAffordanceId === work.id) begin(p, work, rec);
        r.until = dayStart(today(s) + 1) + 480;
      }
      return;
    }
  }
  if (t >= DAY_END - 30) {
    if (r.where !== 'home') moveTo(s, r, 'home', 'home', 60);
    else r.until = s.minute + 60;
    return;
  }
  // Free time: their own choice. A host with a guest stays in.
  const hosting = s.residents.some((o) => o.where === `visit:${r.id}`);
  const offers = hosting
    ? freeOffers(s, r).filter((o) => o.id === 'home' || o.id === 'meal')
    : freeOffers(s, r);
  const rec: DecisionRecord = decide(p, offers, { now: s.minute });
  const aff = offers.find((o) => o.id === rec.chosenAffordanceId) ?? offers[0];
  if (!aff) return;
  begin(p, aff, rec);
  const mins = aff.duration;
  if (aff.id === 'home' || aff.id === 'meal') {
    if (r.where !== 'home') moveTo(s, r, 'home', aff.id, mins);
    else r.until = s.minute + mins;
  } else if (aff.id === 'step') moveTo(s, r, 'step', 'step', mins);
  else if (aff.id === 'shop') moveTo(s, r, 'shop', 'shop', mins);
  else if (aff.id === 'roof') moveTo(s, r, 'roof', 'roof', mins);
  else if (aff.id.startsWith('visit:')) moveTo(s, r, aff.id as Where, 'visit', mins);
}

// ---------- talk between residents ----------

function stairsMeet(s: GameState, r: RState) {
  for (const o of s.residents) {
    if (o.id === r.id || o.stairsUntil < s.minute) continue;
    const [a0, a1] = r.stairsFloors;
    const [b0, b1] = o.stairsFloors;
    if (a1 < b0 || b1 < a0) continue;
    talk(s, r.id, o.id, 'the stairs', 1);
  }
}

/** Whether the kapıcı is close enough to hear a talk at `where`. */
function nearTalk(s: GameState, where: string, a: Rid, b: Rid): boolean {
  if (s.k.walk) return false;
  const at = s.k.at;
  if (where === 'step') return at === 'step' || at === 'room' || at === 'landing:0' || at === 'door:hacer';
  if (where === 'the stairs') {
    const f = floorOf(at);
    const ra = rOf(s, a);
    return !outside(at) && f >= ra.stairsFloors[0] && f <= ra.stairsFloors[1];
  }
  // In a flat: the kapıcı on that landing hears voices through the door, but only bits.
  const host = s.residents.find((x) => `flat ${RESIDENTS[x.id].flat}` === where);
  void b;
  return (
    !!host &&
    floorOf(at) === RESIDENTS[host.id].floor &&
    (at.startsWith('door:') || at.startsWith('landing:'))
  );
}

/** Two residents talk: each tells the other what they are sure of, through HF `converse`. */
export function talk(s: GameState, a: Rid, b: Rid, where: string, maxClaims?: number) {
  const pa = personOf(s, a);
  const pb = personOf(s, b);
  const ra = relationshipWith(pa, b).affection;
  const rb = relationshipWith(pb, a).affection;
  const near = nearTalk(s, where, a, b);
  // The same two do not go over the same ground twice in two hours.
  if (s.talks.some((x) => s.minute - x.at < 120 && ((x.a === a && x.b === b) || (x.a === b && x.b === a))))
    return;
  if (ra < -0.25 && rb < -0.25) {
    if (near || where === 'step')
      say(
        s,
        'narrator',
        `${nameOf(a)} and ${nameOf(b)} on ${where === 'step' ? 'the step' : where}. Not a word.`,
        'journal',
      );
    s.talks.push({ at: s.minute, a, b, where, props: [], overheard: near });
    return;
  }
  const props: string[] = [];
  const heard: string[] = [];
  for (const [sp, li] of [
    [pa, pb],
    [pb, pa],
  ] as const) {
    tick(sp, Math.max(sp.now, s.minute));
    tick(li, Math.max(li.now, s.minute));
    const res = converse(sp, li, {
      at: s.minute,
      traits: TRAITS,
      ...(maxClaims !== undefined ? { maxClaims } : {}),
    });
    for (const c of res.claims) props.push(c.prop);
    const before = res.told.flatMap((pc) =>
      (pc.claims ?? []).map((c) => ({ prop: c.prop, b: credence(li, c.prop) })),
    );
    perceive(li, res.told);
    customReputation(li, before, s.minute);
    for (const ev of res.socialEvents.speaker) socialEvent(sp, ev);
    for (const ev of res.socialEvents.listener) socialEvent(li, ev);
    for (const c of res.told.flatMap((pc) => pc.claims ?? []))
      if (!(c.prop === 'notice:water' && waterGone(s)))
        heard.push(`${nameOf(sp.id)}: ${claimWords(c.prop, c.value, s.version)}`);
    if (near)
      perceive(
        s.kapici,
        res.told.map((pc) => ({ ...pc, channel: 'heard' as const, targetId: KAPICI, salience: 0.7 })),
      );
  }
  // A story of yours, repeated to someone who knows better: they now doubt your word.
  for (const [sp, li] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const x of rOf(s, sp).told) {
      if (!props.includes(x.prop)) continue;
      const c = credence(personOf(s, li), x.prop);
      if ((x.value ? 1 - c : c) >= 0.75 && !rOf(s, li).caught.some((m) => s.minute - m < 600)) {
        doubtKapici(s, li, sp, x.prop, x.value);
      }
    }
  }
  // Word gets back: a friend of the subject who heard a story about them from you tells them who said it.
  for (const [x, subj] of [
    [a, b],
    [b, a],
  ] as const) {
    const px = personOf(s, x);
    if (relationshipWith(px, subj).affection <= 0.2) continue;
    for (const told of rOf(s, x).told) {
      if (!told.prop.startsWith(`${subj}:`) || rOf(s, subj).grudges.some((g) => g.prop === told.prop))
        continue;
      const trait = told.prop.split(':')[1] ?? '';
      const e = TRAITS[trait];
      if (!e || e.affection + e.trust + e.respect < 0 !== told.value) continue;
      wordGetsBack(s, subj, x, told.prop, told.value, told.lie);
    }
  }
  const t: Talk = { at: s.minute, a, b, where, props, overheard: near };
  s.talks.push(t);
  if (s.talks.length > 300) s.talks.splice(0, s.talks.length - 300);
  // Comparing notes: if the kapıcı told them opposite things about something they just spoke of, both notice.
  const ca = rOf(s, a);
  const cb = rOf(s, b);
  const spoken = new Set(props);
  let caught = false;
  for (const x of ca.told) {
    if (!spoken.has(x.prop)) continue;
    if (cb.told.some((y) => y.prop === x.prop && y.value !== x.value)) caught = true;
  }
  if (caught) {
    t.caught = true;
    catchKapici(s, a, b);
  }
  const place = where === 'step' ? 'on the step' : where === 'the stairs' ? 'on the stairs' : `in ${where}`;
  if (near) {
    // Only what is new to you today; the rest is the hum of the building.
    const d0 = dayStart(today(s));
    const old = new Set(s.said.filter((x) => x.kind === 'heard' && x.at >= d0).map((x) => x.text));
    const fresh = heard.filter((h) => !old.has(h));
    const opener = `${nameOf(a)} and ${nameOf(b)} ${place}. You could hear them.`;
    if (fresh.length === 0 && s.said.some((x) => x.at >= d0 && x.text === opener)) return;
    say(s, 'narrator', opener, 'journal');
    for (const h of fresh.slice(0, 4)) say(s, 'narrator', h, 'heard');
    if (fresh.length === 0)
      say(
        s,
        'narrator',
        heard.length
          ? pick(s, ['Nothing you had not heard already today.', 'The same stories, round again.'])
          : pick(s, [
              'Only the weather, and the price of bread.',
              'Grandchildren, mostly.',
              'The price of tomatoes at the market.',
              'The football, then the weather.',
              'Whose turn it is to water the plants on the landing.',
            ]),
        'heard',
      );
  } else if (where !== 'the stairs' || props.length > 0) {
    say(
      s,
      'narrator',
      `${nameOf(a)} and ${nameOf(b)} talked ${place}${props.length ? ' for a while' : ''}.`,
      'journal',
    );
  }
}

/** HF's perceive moves relationships for its own trait table only; the building's extra traits are applied here. */
/** The water went off on Wednesday at ten: after that the notice is old news. */
const waterGone = (s: GameState) => s.minute >= dayStart(3) + 10 * 60;

function customReputation(p: Person, before: { prop: string; b: number }[], at: number) {
  for (const { prop, b } of before) {
    const trait = prop.split(':')[1];
    if (trait !== 'nosy') continue;
    applyReputationBelief(p, prop, b, credence(p, prop), at, TRAITS);
  }
}

function wordGetsBack(s: GameState, subj: Rid, from: Rid, prop: string, value: boolean, lie: boolean) {
  const p = personOf(s, subj);
  const r = rOf(s, subj);
  r.grudges.push({ prop, from, at: s.minute, lie });
  socialEvent(p, { at: s.minute, kind: 'insult', otherId: KAPICI, byMe: false, magnitude: lie ? 0.4 : 0.25 });
  if (lie) {
    believeSelf(p, 'kapici:dishonest', true, 0.75, s.minute);
    seedSourceTrust(p, KAPICI, trustOf(p, KAPICI) * 0.8);
  }
  say(s, 'narrator', `${nameOf(from)} told ${nameOf(subj)} what you had been saying about them.`, 'event');
  stamp(s, 'word_back');
  void value;
}

function doubtKapici(s: GameState, who: Rid, from: Rid, prop: string, value: boolean) {
  const p = personOf(s, who);
  believeSelf(p, 'kapici:dishonest', true, 0.68, s.minute);
  seedSourceTrust(p, KAPICI, trustOf(p, KAPICI) * 0.85);
  rOf(s, who).caught.push(s.minute);
  say(
    s,
    'narrator',
    `${nameOf(from)} told ${nameOf(who)} what you had said: “${claimWords(prop, value, s.version)}” ${nameOf(who)} knows better.`,
    'event',
  );
}

function catchKapici(s: GameState, a: Rid, b: Rid) {
  for (const id of [a, b]) {
    const p = personOf(s, id);
    const before = credence(p, 'kapici:dishonest');
    perceive(p, [
      {
        at: s.minute,
        channel: 'saw',
        kind: 'deceit',
        actorId: KAPICI,
        salience: 0.9,
        valence: -0.4,
        summary: 'the kapıcı told us two different stories',
        claims: [{ prop: 'kapici:dishonest', value: true, confidence: 0.85 }],
      },
    ]);
    if (credence(p, 'kapici:dishonest') <= before)
      applyReputationBelief(p, 'kapici:dishonest', before, credence(p, 'kapici:dishonest'), s.minute);
    // Preserve v3's fixed loss on each comparison. HF contradicted requires a retained
    // opposite account and caps loss per source/proposition (docs/hf-requests.md, 2).
    seedSourceTrust(p, KAPICI, trustOf(p, KAPICI) * 0.75);
    rOf(s, id).caught.push(s.minute);
  }
  stamp(s, 'caught');
  say(s, 'narrator', `${nameOf(a)} and ${nameOf(b)} compared notes. Your two stories met.`, 'event');
  say(s, 'riza', 'They always compare. Always. Tell them the same thing or tell them nothing.', 'margin');
}

// ---------- words ----------

const TRAIT_WORDS: Record<string, [string, string]> = {
  stingy: ['is tight with money', 'is not tight with money'],
  generous: ['is generous', 'is not generous'],
  nosy: ['pokes into everyone’s business', 'minds their own business'],
  kind: ['has a kind heart', 'is not so kind'],
  cruel: ['can be cruel', 'is not cruel'],
  lazy: ['does nothing all day', 'is not lazy'],
  hardworking: ['works hard', 'does not work much'],
  honest: ['is honest', 'is not honest'],
  dishonest: ['is not straight with people', 'is straight with people'],
  reliable: ['can be counted on', 'cannot be counted on'],
  unreliable: ['cannot be counted on', 'can be counted on'],
  owes: ['owes money', 'owes nothing'],
};

export function claimWords(prop: string, value: boolean, edition = LEGACY_GAME_VERSION): string {
  const privateWords = Object.hasOwn(PRIVATE_WORDS, prop) ? PRIVATE_WORDS[prop] : undefined;
  if (privateWords) return privateWords[value ? 0 : 1];
  const story =
    (edition === GAME_VERSION || edition === PREVIOUS_GAME_VERSION) && Object.hasOwn(STORY_WORDS, prop)
      ? STORY_WORDS[prop]
      : undefined;
  if (story) return story[value ? 0 : 1];
  const [who, trait, other] = prop.split(':');
  if (prop === FACTS.ring)
    return value ? 'Burak had a parcel of paper-making supplies.' : 'Burak’s parcel was nothing special.';
  if (prop === FACTS.visitor)
    return value ? 'A man comes to Derya’s door late at night.' : 'Nobody comes to Derya’s at night.';
  if (prop === 'derya:brother')
    return value ? 'The man at Derya’s is her brother.' : 'That man is not her brother.';
  if (prop === FACTS.fund) return value ? 'The boiler fund is short.' : 'The boiler fund is fine.';
  if (prop === 'notice:water')
    return value ? 'The water is off on Wednesday, ten to twelve.' : 'The water is not going off.';
  if (prop === 'hacer:sevim') return 'Hacer and Sevim disagree about a notice.';
  if (who === 'kapici') {
    const w = TRAIT_WORDS[trait ?? '']?.[value ? 0 : 1] ?? trait;
    return `The new kapıcı ${w}.`;
  }
  if (trait === 'sweet' && other)
    return value
      ? `${nameOf(who ?? '')} is sweet on ${nameOf(other)}.`
      : `${nameOf(who ?? '')} is not sweet on ${nameOf(other)}.`;
  if (trait === 'owes')
    return value ? `${nameOf(who ?? '')} is behind with the dues.` : `${nameOf(who ?? '')} owes nothing.`;
  const w = TRAIT_WORDS[trait ?? '']?.[value ? 0 : 1];
  if (w) return `${nameOf(who ?? '')} ${w}.`;
  return prop;
}

// ---------- what the kapıcı can say at a door ----------

export interface Tellable {
  prop: string;
  value: boolean;
  /** The kapıcı's own credence on that side, 0..1, as a word. */
  sure: 'sure' | 'heard' | 'doubt';
  words: string;
}

/** Things in the notebook the kapıcı could pass on to `to` (not about themself). */
export function tellables(s: GameState, to: Rid): Tellable[] {
  const out: Tellable[] = [];
  for (const b of s.kapici.memory.beliefs) {
    const [subject] = b.prop.split(':');
    if (subject === to) continue;
    if (b.prop.startsWith('advice:') || b.prop.includes(':should:')) continue;
    if (b.prop === 'notice:water' && waterGone(s)) continue;
    const c = credence(s.kapici, b.prop);
    if (Math.abs(c - 0.5) < 0.1) continue;
    const value = c > 0.5;
    const side = value ? c : 1 - c;
    if (b.prop.startsWith('kapici:')) continue;
    // Not back to the person you had it from, nor again to someone you already told.
    if (b.sources.some((x) => x.id === to && x.value === value)) continue;
    if (b.prop === 'notice:water' && to === 'burak') continue;
    if (rOf(s, to).told.some((x) => x.prop === b.prop && x.value === value)) continue;
    out.push({
      prop: b.prop,
      value,
      sure: side >= 0.8 ? 'sure' : side >= 0.65 ? 'heard' : 'doubt',
      words: claimWords(b.prop, value, s.version),
    });
  }
  return out.sort((x, y) => (x.prop < y.prop ? -1 : 1));
}

// ---------- doors ----------

/** The resident the kapıcı can talk to where he stands (at their door with them home, or with them on the step). */
export function faceToFace(s: GameState): Rid[] {
  if (s.k.walk || s.phase !== 'day') return [];
  const at = s.k.at;
  if (at.startsWith('door:')) {
    const id = at.slice(5) as Rid;
    const r = rOf(s, id);
    return r.where === 'home' ? [id] : [];
  }
  if (at === 'step') return atStep(s);
  return [];
}

function deliverAt(s: GameState, pl: Place, onlyHome = false) {
  const id = pl.startsWith('door:') ? (pl.slice(5) as Rid) : null;
  for (const t of s.tasks) {
    if (t.done || !t.carried || t.place !== pl) continue;
    if (t.kind === 'bins') continue;
    if (!id) continue;
    const r = rOf(s, id);
    const there = r.where === 'home';
    if (!there && (onlyHome || t.kind === 'parcel' || t.kind === 'job')) continue;
    complete(s, t, !there);
  }
  if (pl === 'step')
    for (const t of s.tasks) if (t.kind === 'bins' && t.carried && !t.done) complete(s, t, false);
}

function pickupAt(s: GameState, pl: Place) {
  for (const t of s.tasks) {
    if (t.done || t.carried || t.pickup !== pl || t.from > s.minute) continue;
    t.carried = true;
    if (t.label2) {
      perceive(s.kapici, [
        {
          at: s.minute,
          channel: 'saw',
          kind: 'label',
          salience: 0.8,
          summary: t.label2.text,
          claims: [{ prop: t.label2.prop, value: true, confidence: 0.85 }],
        },
      ]);
      learn(s, t.label2.prop);
      say(s, 'narrator', t.label2.text, 'event');
      say(
        s,
        'riza',
        'Paper supplies. That label tells you what arrived, not what he is making. Let him choose whether to show you.',
        'margin',
      );
    }
  }
}

/** A task is done: the resident's thanks (HF social event) and their tip, which depends on how they feel about you. */
/** What each resident says at the door when the job is done: their own words, varied, so no line repeats often. */
const THANKS: Record<Rid, string[]> = {
  hacer: [
    'Ah, there you are. Sit a minute. No? Always running.',
    'Good boy. Rıza was never this quick.',
    'Leave it on the stool. Mind the cat, if there is a cat.',
  ],
  sevim: [
    'Thank you. Exactly right, for once.',
    'Put it there, please. Mind the mat.',
    'On time. I noticed.',
  ],
  burak: ['Thanks, abi. Really.', 'Perfect, thank you.', 'You’re a lifesaver.'],
  derya: ['You’re kind. Thank you.', 'Oh, thank you. I’m dead on my feet.', 'Thanks, really.'],
  tarik: [
    'Thank you, son. These stairs.',
    'Bless your legs. Thank you.',
    'Thank you. Sit a minute, if you can.',
  ],
};
const JOB_THANKS: Record<Rid, string[]> = {
  hacer: ['Look at that. Like new. Rıza used to grumble the whole time.', 'Good. Now I can breathe.'],
  sevim: ['Done properly. Thank you.', 'That’s been bothering me for a week.'],
  burak: ['You’re a lifesaver, honestly.', 'I owe you a coffee.'],
  derya: ['Thank you. One less thing.', 'You didn’t have to do that so well.'],
  tarik: ['My hands used to do that. Thank you, son.', 'Sit, have a tea. Five minutes.'],
};
const LATE_LINES: Record<Rid, string[]> = {
  hacer: [
    'Finally. I nearly sent someone down for you.',
    'Late. Rıza would have been late too, but he would have had a story.',
  ],
  sevim: ['It’s gone cold. Never mind.', 'I had given up on you.'],
  burak: ['No problem, I managed. Thanks anyway.', 'Ah, I’d already gone without. Thanks.'],
  derya: ['It’s fine. Everyone’s late today.', 'Thanks. I nearly went myself.'],
  tarik: [
    'I waited. It doesn’t matter. Thank you.',
    'There you are. I thought you had forgotten the old man.',
  ],
};

function complete(s: GameState, t: Task, hook: boolean) {
  t.done = s.minute;
  t.hook = hook;
  const late = s.minute > t.by;
  if (t.kind === 'bins') {
    if (!late) say(s, 'narrator', 'The bins were out before the truck.', 'journal');
    else
      say(
        s,
        'narrator',
        'The truck comes at a quarter to nine. It had gone; the bins sat on the pavement all night.',
        'journal',
      );
    for (const r of s.residents) {
      socialEvent(personOf(s, r.id), {
        at: s.minute,
        kind: late ? 'harm' : 'help',
        otherId: KAPICI,
        byMe: false,
        magnitude: late ? 0.06 : 0.06,
      });
    }
    return;
  }
  const p = personOf(s, t.for);
  tick(p, Math.max(p.now, s.minute));
  socialEvent(p, { at: s.minute, kind: 'help', otherId: KAPICI, byMe: false, magnitude: late ? 0.04 : 0.14 });
  // Word gets around about a kapıcı who does the job, from the person helped.
  if (!late && credence(p, 'kapici:reliable') < 0.8) believeSelf(p, 'kapici:reliable', true, 0.62, s.minute);
  if (late && s.minute > t.by + 45) believeSelf(p, 'kapici:reliable', false, 0.6, s.minute);
  if (hook) {
    if (late) report(s).late++;
    else report(s).done++;
    say(
      s,
      'narrator',
      `You hung ${nameOf(t.for)}’s ${t.kind === 'bread' ? 'bread' : 'bag'} on the door handle.`,
      'journal',
    );
    return;
  }
  const rr = rOf(s, t.for);
  const present = rr.where === 'home' || (s.k.at === 'step' && rr.where === 'step');
  if (!present) {
    if (late) report(s).late++;
    else report(s).done++;
    say(s, 'narrator', `${nameOf(t.for)} had gone out. They will find it done.`, 'journal');
    return;
  }
  const aff = relationshipWith(p, KAPICI).affection;
  const GIVE: Record<Rid, number> = {
    hacer: 1,
    sevim: 0.6,
    burak: 1.3,
    derya: 1,
    tarik: 0.3,
  };
  const base = t.kind === 'bread' ? 5 : t.kind === 'parcel' ? 10 : 20;
  const tip = Math.round((base * GIVE[t.for] * (late ? 0.4 : 1) * (0.7 + aff)) / 5) * 5;
  if (tip > 0) {
    s.k.money += tip;
    report(s).tips += tip;
  }
  const pool = late ? LATE_LINES[t.for] : t.kind === 'job' ? JOB_THANKS[t.for] : THANKS[t.for];
  const line = pool[Math.floor(hashUnit(s.seed, DRAW.tip, s.minute, t.id) * pool.length)] ?? '';
  say(s, t.for, tip > 0 ? `${line} (₺${tip})` : line, 'voice');
  if (t.for === 'tarik' && !late && hashUnit(s.seed, DRAW.tip, s.minute) < 0.5)
    report(s).treats.push('a lemon candy from Tarık Bey');
  if (late) report(s).late++;
  else report(s).done++;
}

function believeSelf(p: Person, prop: string, value: boolean, conf: number, at: number) {
  const before = credence(p, prop);
  perceive(p, [
    {
      at,
      channel: 'saw',
      kind: 'fact',
      salience: 0.6,
      summary: prop,
      claims: [{ prop, value, confidence: conf }],
    },
  ]);
  void before;
}

function report(s: GameState): DayReport {
  const d = today(s);
  let r = s.reports.find((x) => x.day === d);
  if (!r) {
    r = { day: d, tips: 0, treats: [], done: 0, late: 0, missed: 0, caught: [], talks: 0 };
    s.reports.push(r);
  }
  return r;
}

// ---------- the kapıcı's minute ----------

function kapiciMinute(s: GameState) {
  const k = s.k;
  // Waiting at a door: whoever comes home is handed their things.
  if (!k.walk && k.busyTask === null && k.at.startsWith('door:')) deliverAt(s, k.at, true);
  // On the step: hand people their own things.
  if (!k.walk && k.busyTask === null && k.at === 'step')
    for (const id of atStep(s))
      for (const t of s.tasks)
        if (!t.done && t.carried && t.kind !== 'bins' && t.for === id) complete(s, t, false);
  if (k.walk && s.minute >= k.walk.at1) {
    k.at = k.walk.to;
    k.walk = null;
    arrive(s);
  }
  if (k.busyTask !== null && s.minute >= k.busyUntil) {
    const t = s.tasks.find((x) => x.id === k.busyTask);
    k.busyTask = null;
    if (t && !t.done) {
      complete(s, t, false);
      if (t.label.startsWith('look at the boiler')) boilerFound(s);
    }
    kapiciDoes(s, 'rest', 10, 0.05);
  }
}

function arrive(s: GameState) {
  const k = s.k;
  pickupAt(s, k.at);
  deliverAt(s, k.at);
  // A job here: start work.
  const job = s.tasks.find(
    (t) => !t.done && t.kind === 'job' && t.place === k.at && t.from <= s.minute && !t.pickup,
  );
  if (job?.work) {
    k.busyTask = job.id;
    k.busyUntil = s.minute + job.work;
    kapiciDoes(s, 'work', job.work, 0.5);
  } else kapiciDoes(s, 'rest', 15, 0.05);
  // Derya's bread goes on the hook while she sleeps.
  if (
    k.at === 'door:tarik' &&
    !s.tarik.envelope &&
    today(s) === 5 &&
    relationshipWith(personOf(s, 'tarik'), KAPICI).affection > 0.2
  )
    tarikEnvelope(s);
}

// ---------- inputs ----------

/** Explicit player request completes only at the real worked-shift boundary. */
function pauseDeryaRota(s: GameState) {
  const p = personOf(s, 'derya');
  const episode = p.memory.episodes.findLast((e) => e.action === 'night-work');
  if (!episode || s.minute !== 480) return;
  if (p.activity) {
    if (p.activity.affordanceId !== 'derya-day-sleep' || p.activity.startedAt !== 480) return;
    finish(p, {
      affordanceId: p.activity.affordanceId,
      action: p.activity.action,
      status: 'interrupted',
      at: p.now,
    });
  }
  s.oneCast = {
    ...s.oneCast,
    rows: s.oneCast?.rows ?? [],
    departure: { at: s.minute, episodeId: episode.id },
  };
  say(
    s,
    'derya',
    'My night rota is finished. I am pausing here before the temporary relief chapter; flat 5 is still home.',
    'voice',
  );
}

function applyInput(s: GameState, inp: Input) {
  switch (inp.kind) {
    case 'one-cast-depart': {
      if (s.version !== GAME_VERSION || s.oneCast?.departure || s.minute > 480) return;
      s.oneCast = { ...s.oneCast, rows: s.oneCast?.rows ?? [], departureRequested: true };
      if (s.minute === 480) pauseDeryaRota(s);
      else
        say(
          s,
          'narrator',
          'Derya will pause her rota when this night shift ends at eight. Her morning sleep is still due.',
          'journal',
        );
      return;
    }
    case 'go': {
      if (s.phase !== 'day' || s.k.walk || s.k.busyTask !== null) return;
      const mins = travelMinutes(s, s.k.at, inp.to);
      if (mins <= 0) {
        const before = s.tasks.filter((t) => t.carried || t.done).length;
        pickupAt(s, s.k.at);
        deliverAt(s, s.k.at);
        if (s.tasks.filter((t) => t.carried || t.done).length === before)
          say(s, 'narrator', 'You are already here. Nothing to pick up or hand over just now.', 'journal');
        return;
      }
      const up = floorOf(inp.to) > floorOf(s.k.at);
      s.k.walk = { from: s.k.at, to: inp.to, at0: s.minute, at1: s.minute + mins };
      kapiciDoes(s, 'walk', mins, up ? 0.85 : 0.35);
      return;
    }
    case 'news':
    case 'tell':
    case 'invent':
    case 'word':
      if (!canTalk(s, inp.who)) {
        say(s, 'narrator', `${nameOf(inp.who)} is not in front of you.`, 'journal');
        return;
      }
      if (inp.kind === 'news') return askNews(s, inp.who);
      if (inp.kind === 'tell') return tell(s, inp.who, inp.prop, inp.value, inp.sure);
      if (inp.kind === 'invent') return invent(s, inp.who, inp.about, inp.trait);
      return askWord(s, inp.who);
    case 'sit':
      if (!canTalk(s, inp.who)) {
        say(s, 'narrator', `${nameOf(inp.who)} is not in front of you.`, 'journal');
        return;
      }
      return sit(s, inp.who, inp.topic);
    case 'misdeliver':
      return misdeliver(s, inp.who, inp.task);
    case 'knock':
      return knock(s, inp.who);
    case 'prank':
      return prank(s, inp.what);
    case 'next':
      return turnPage(s);
  }
}

/** Each resident's stories, told one a sitting, in order: what they say when the kapıcı sits with them. */
const SIT_LINES: Record<Rid, string[]> = {
  hacer: [
    'I used to work behind a shop counter. Now my niece has family paperwork for us in Istanbul.',
    'The plane tree outside this window drops leaves shaped like little boats. I keep some between catalogues.',
    'Sevim corrected my notice. She thought I wanted every visitor to explain themselves. I meant a quiet entrance.',
  ],
  sevim: [
    'Forty years of children reading aloud. I still hear them in the evenings.',
    'Hacer heard a correction as a command. Perhaps I could have asked what she meant first.',
    'My child writes from abroad. I answer too formally, then wonder why the conversation feels distant.',
  ],
  burak: [
    'An account can be complete. A conversation rarely tells you when you have done enough.',
    'Could you hold this fold a moment? No, another evening. It is not quite ready.',
    'I like accounting. I also like making something that does not have to be useful.',
  ],
  derya: [
    'Four in the morning is the honest hour. Everybody says what they mean at four.',
    'I sleep with the pillow over my head. Your bell goes through it anyway.',
    'People on the step count my visitors. Let them count.',
  ],
  tarik: [
    'In ’74 the ferry froze in the harbour. Did I tell you? We walked to Karaköy on the ice. Nobody believes me.',
    'My family visits when they can. A cancelled visit still takes up a space in the day.',
    'Forty years on the Kadıköy run. I could do it with my eyes shut. Some mornings I did.',
    'You climb those stairs for me every day. My legs thank you. The rest of me too.',
  ],
};

/** Sit a minute: ten minutes off your legs and a story; once a day each. */
function sit(s: GameState, who: Rid, topic?: 'boundaries') {
  const r = rOf(s, who);
  if (r.sitDay === today(s)) {
    say(s, who, 'Another time. You have work, and so do I.', 'voice');
    return;
  }
  r.sitDay = today(s);
  const lines = SIT_LINES[who];
  say(
    s,
    who,
    who === 'derya' && topic === 'boundaries'
      ? 'Work boundaries and training? I want to choose what I tell you. Nursing does not make me available to the whole building.'
      : (lines[r.sits % lines.length] as string),
    'voice',
  );
  r.sits++;
  const p = personOf(s, who);
  tick(p, Math.max(p.now, s.minute));
  socialEvent(p, { at: s.minute, kind: 'chat', otherId: KAPICI, byMe: false, magnitude: 0.3 });
  storySitting(s, who, topic);
  kapiciDoes(s, 'rest', 10, 0.02);
  s.k.walk = { from: s.k.at, to: s.k.at, at0: s.minute, at1: s.minute + 10 };
}

function canTalk(s: GameState, who: Rid): boolean {
  return faceToFace(s).includes(who);
}

/** "Anything new?": the resident tells the kapıcı what they are sure of (HF converse), once a day. */
function askNews(s: GameState, who: Rid) {
  if (!canTalk(s, who)) return;
  const r = rOf(s, who);
  const p = personOf(s, who);
  if (r.newsDay === today(s)) {
    say(s, who, 'You asked me already. Nothing since.', 'voice');
    return;
  }
  r.newsDay = today(s);
  tick(p, Math.max(p.now, s.minute));
  tick(s.kapici, Math.max(s.kapici.now, s.minute));
  const aff = relationshipWith(p, KAPICI).affection;
  if (storyNews(s, who)) return;
  if (aff < -0.2) {
    say(s, who, 'Nothing for you today.', 'voice');
    return;
  }
  const res = converse(p, s.kapici, { at: s.minute, traits: TRAITS, maxClaims: aff > 0.25 ? 3 : 2 });
  perceive(s.kapici, res.told);
  for (const ev of res.socialEvents.speaker) socialEvent(p, ev);
  const claims = res.told.flatMap((pc) => pc.claims ?? []);
  if (
    who === 'derya' &&
    !s.derya.told &&
    trustOf(p, KAPICI) >= 0.58 &&
    aff >= 0.15 &&
    s.secrets[FACTS.visitor]
  ) {
    s.derya.told = true;
    perceive(s.kapici, [
      {
        at: s.minute,
        channel: 'told',
        kind: 'fact',
        actorId: 'derya',
        salience: 0.9,
        summary: 'Derya: my brother',
        claims: [{ prop: 'derya:brother', value: true, confidence: 0.95 }],
      },
    ]);
    learn(s, 'derya:brother');
    say(
      s,
      who,
      'The man at night? That’s Volkan, my brother. He lost his job. Don’t tell the building, they’d make a story of it.',
      'voice',
    );
    stamp(s, 'confided');
    return;
  }
  if (claims.length === 0) {
    const quiet = res.withheld.some((w) => w.reason === 'norm:backbiting');
    say(s, who, quiet ? pick(s, NO_STORIES[who]) : pick(s, SMALL_NEWS[who]), 'voice');
    return;
  }
  for (const c of claims) {
    say(s, who, claimWords(c.prop, c.value, s.version), 'voice');
    for (const sp of SECRET_PROPS)
      if (sp.prop === c.prop && sp.value === c.value && s.secrets[c.prop] === undefined) {
        learn(s, c.prop);
        say(s, 'narrator', 'A new line in the notebook.', 'event');
      }
  }
}

/** When a resident has nothing about anyone to pass on, they talk about their own life: each in their own words. */
const SMALL_NEWS: Record<Rid, string[]> = {
  hacer: [
    'My knee again. Rain coming, you’ll see.',
    'The grocer gave me short change. Twice this month.',
    'Nothing. I sat by the window all morning and nothing.',
  ],
  sevim: [
    'The notice board is a disgrace. Somebody spelled “boiler” wrong.',
    'My child rang from abroad. Too busy, as usual.',
    'Nothing worth repeating.',
  ],
  burak: [
    'Month end. I live at the office.',
    'Nothing much. Work.',
    'Honestly? Tired. That’s the news.',
    'I’m trying to decide something. Don’t ask.',
    'My mother rang. She asks when I will settle down. Every call.',
    'Do you think people can tell when you are nervous?',
  ],
  derya: [
    'Long night. Two admissions at four.',
    'Nothing, I slept through it all.',
    'I’m off Saturday. That’s my news.',
  ],
  tarik: [
    'My family may ring on Sunday. May.',
    'In ’74 the ferry froze in the harbour. Did I tell you?',
    'The gulls woke me at five. Same as always.',
  ],
};
const NO_STORIES: Record<Rid, string[]> = {
  hacer: ['Nothing for you today.'],
  sevim: ['I don’t repeat things.'],
  burak: ['I don’t really do gossip.', 'I stay out of all that.'],
  derya: ['I hear enough at the hospital. Not here.'],
  tarik: ['Let’s not talk about people.', 'At my age you stop carrying stories.'],
};

/** The kapıcı tells a resident something: HF told testimony, believed as far as they trust his word. */
function tell(s: GameState, who: Rid, prop: string, value: boolean, sure: boolean) {
  if (!canTalk(s, who)) return;
  if (storyTell(s, who, prop, value)) return;
  const own = credence(s.kapici, prop);
  const side = value ? own : 1 - own;
  const conf = sure ? 0.95 : Math.max(0.55, Math.min(0.9, side));
  deliverClaim(s, who, prop, value, conf, side < 0.5);
}

function invent(s: GameState, who: Rid, about: Rid, trait: string) {
  if (about === who) {
    say(s, 'narrator', 'Not to their face.', 'journal');
    return;
  }
  if (!(INVENTABLE as readonly string[]).includes(trait) && !trait.startsWith('sweet:')) {
    say(s, 'narrator', 'You could not think how to put it.', 'journal');
    return;
  }
  const prop = `${about}:${trait}`;
  if (trait.startsWith('sweet:')) {
    const other = trait.slice(6) as Rid;
    if (!RESIDENTS[about].single || !RESIDENTS[other]?.single || other === about) {
      say(
        s,
        'narrator',
        'Nobody would believe that of a married person. Only people who are single.',
        'journal',
      );
      return;
    }
  }
  const own = credence(s.kapici, prop);
  deliverClaim(s, who, prop, true, 0.9, own < 0.6);
}

function deliverClaim(s: GameState, who: Rid, prop: string, value: boolean, conf: number, lie: boolean) {
  const p = personOf(s, who);
  const r = rOf(s, who);
  tick(p, Math.max(p.now, s.minute));
  const before = credence(p, prop);
  const subject = prop.split(':')[0] as string;
  const trait = prop.split(':')[1] ?? '';
  perceive(p, [
    {
      at: s.minute,
      channel: 'told',
      kind: 'gossip',
      actorId: KAPICI,
      targetId: who,
      salience: 0.75,
      summary: claimWords(prop, value, s.version),
      claims: [{ prop, value, confidence: conf }],
    },
  ]);
  customReputation(p, [{ prop, b: before }], s.minute);
  const after = credence(p, prop);
  r.told.push({ prop, value, at: s.minute, lie });
  if (r.told.length > 40) r.told.splice(0, r.told.length - 40);
  const moved = (after - before) * (value ? 1 : -1);
  const already = (value ? before : 1 - before) >= 0.75;
  const effect = TRAITS[trait];
  const unfav = !!effect && effect.affection + effect.trust + effect.respect < 0 === value;
  const aboutPerson = subject in RESIDENTS;
  const feel = aboutPerson ? relationshipWith(p, subject).affection : 0;
  const strict = p.conscience.norms.find((n) => n.normId === 'backbiting');
  const holds = !!strict && strict.standing === 'forbidden' && strict.conviction >= 0.6;
  let line: string;
  let pleasure = 0;
  if (already) line = pick(s, ['Everybody knows that.', 'Old news, evladım.', 'I know, I know.']);
  else if (unfav && aboutPerson && holds) {
    line = pick(s, [
      'I’d rather not hear it.',
      'That’s their business, not mine.',
      'Let’s not talk about people.',
    ]);
    socialEvent(p, { at: s.minute, kind: 'conflict', otherId: KAPICI, byMe: false, magnitude: 0.1 });
  } else if (unfav && aboutPerson && feel > 0.35) {
    line = pick(s, [
      `Don’t talk like that about ${nameOf(subject)}.`,
      `${nameOf(subject)}? No. Not ${nameOf(subject)}.`,
    ]);
    socialEvent(p, { at: s.minute, kind: 'insult', otherId: KAPICI, byMe: false, magnitude: 0.2 });
  } else if (moved < 0.03)
    line = pick(s, ['Who told you that?', 'Hm. If you say so.', 'I’ll believe it when I see it.']);
  else if (unfav && aboutPerson && feel < 0) {
    line = pick(s, [
      'I knew it. Didn’t I always say?',
      'Of course. Of course she is.',
      'Ha! Come in a minute, tell me properly.',
    ]);
    pleasure = moved * (0.5 - feel) * 2;
  } else if (!unfav && aboutPerson && feel > 0.2) {
    line = pick(s, ['That’s nice to hear.', 'Good. Good for them.']);
    pleasure = moved * feel;
  } else if (prop === FACTS.ring || prop.includes(':sweet:') || prop === FACTS.visitor) {
    line = pick(s, ['No! Really?', 'Well! Who would have thought.', 'Tell me everything.']);
    pleasure = moved * (0.3 + p.traits.openness);
  } else line = pick(s, ['Is that so.', 'Hm.', 'Interesting.']);
  say(s, who, line, 'voice');
  if (pleasure > 0.04) {
    socialEvent(p, {
      at: s.minute,
      kind: 'chat',
      otherId: KAPICI,
      byMe: false,
      magnitude: Math.min(0.6, pleasure * 4),
    });
    if (r.treatDay !== today(s) && pleasure > 0.08) {
      r.treatDay = today(s);
      const treat = TREAT[who];
      report(s).treats.push(treat);
      if (who !== 'tarik' && who !== 'burak') {
        s.k.money += 10;
        report(s).tips += 10;
      }
      say(s, 'narrator', `${nameOf(who)} pressed ${treat.replace(/ from .*/, '')} on you.`, 'event');
      stamp(s, 'treat');
    }
  }
  if (prop === FACTS.ring && who === 'hacer') s.ring.spoiled = credence(p, FACTS.ring) >= 0.7;
}

const TREAT: Record<Rid, string> = {
  hacer: 'a slice of börek from Hacer Hanım',
  sevim: 'two biscuits from Sevim Hanım',
  burak: 'a coffee from Burak',
  derya: 'a bag of oranges from Derya',
  tarik: 'a lemon candy from Tarık Bey',
};

function pick(s: GameState, xs: string[]): string {
  return xs[Math.floor(hashUnit(s.seed, s.minute, xs.length, s.lineNo) * xs.length)] as string;
}

/** "Put in a word for me on Sunday": a request the resident weighs through HF; a yes is their own promise. */
export function wordOffers(): Affordance[] {
  return [
    offer('promise_word', {
      action: 'help',
      label: 'promise a word for the kapıcı',
      duration: 2,
      targetId: KAPICI,
      tags: ['help'],
      advertises: { belonging: 0.04 },
    }),
    offer('demur', { action: 'wait', label: 'make no promise', duration: 2, advertises: { autonomy: 0.1 } }),
  ];
}
export const wordAsk: Suggestion = { voiceId: KAPICI, affordanceId: 'promise_word', strength: 0.5 };

export function wordHint(s: GameState, who: Rid): string {
  const p = personOf(s, who);
  const r = predict(p, wordOffers(), wordAsk);
  return r.verdict === 'assented' ? 'likely yes' : r.verdict === 'refused' ? 'likely no' : 'maybe';
}

function askWord(s: GameState, who: Rid) {
  const r = rOf(s, who);
  if (r.word) {
    say(s, who, r.word === 'yes' ? 'I said I would. Don’t ask twice.' : 'I told you already.', 'voice');
    return;
  }
  if (today(s) < 4) {
    say(
      s,
      who,
      pick(s, [
        'Sunday? Ask me nearer the day. I hardly know you.',
        'It’s only the start of the week. We’ll see.',
      ]),
      'voice',
    );
    return;
  }
  const p = personOf(s, who);
  tick(p, Math.max(p.now, s.minute));
  const offers = wordOffers();
  const rec = decide(p, offers, { suggestion: wordAsk, now: s.minute });
  const res = rec.suggestion;
  if (rec.chosenAffordanceId === 'promise_word') {
    r.word = 'yes';
    promise(p, {
      kind: 'promise',
      toId: KAPICI,
      label: 'my word for the kapıcı',
      actions: ['help'],
      targetId: KAPICI,
      from: dayStart(7) + MEETING - 30,
      until: dayStart(7) + MEETING + 60,
      importance: 0.04 + 0.2 * Math.max(0, relationshipWith(p, KAPICI).affection),
      normId: 'keep-promise',
    });
    say(
      s,
      who,
      pick(s, ['Of course. You’ve been good to us.', 'All right. I’ll say something.', 'For you, yes.']),
      'voice',
    );
  } else {
    r.word = 'no';
    say(s, who, res?.says ?? 'Let’s see how the week goes.', 'voice');
  }
}

/** Leave a parcel at the wrong door: the resident decides whether to peek (their own HF choice). */
function misdeliver(s: GameState, who: Rid, taskId: number) {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!canTalk(s, who)) {
    say(s, 'narrator', 'Nobody here to take it. A parcel is never left on a handle.', 'journal');
    return;
  }
  if (!t || t.done || !t.carried || t.kind !== 'parcel' || t.for === who) {
    say(
      s,
      'narrator',
      'Only a courier parcel can go to the wrong door. Bread and shopping are expected.',
      'journal',
    );
    return;
  }
  const p = personOf(s, who);
  tick(p, Math.max(p.now, s.minute));
  t.carried = false;
  t.wrongDoor = who;
  const peek = offer('peek', {
    label: 'have a little look',
    duration: 3,
    advertises: { leisure: 0.12 + 0.25 * p.traits.openness },
    norms: [{ normId: 'privacy', relation: 'violates' }],
  });
  const keep = offer('set_aside', {
    action: 'wait',
    label: 'put it by the door for later',
    duration: 2,
    advertises: {},
  });
  if (!p.conscience.norms.some((n) => n.normId === 'privacy'))
    p.conscience.norms.push({
      normId: 'privacy',
      standing: 'disliked',
      conviction: Math.min(0.9, p.traits.honesty),
    });
  const rec = decide(p, [peek, keep], { now: s.minute });
  say(
    s,
    who,
    pick(s, [
      `For ${nameOf(t.for)}? Leave it, I’ll see it gets there.`,
      `${nameOf(t.for)}’s? Fine, put it down.`,
    ]),
    'voice',
  );
  stamp(s, 'wrong_door');
  if (rec.chosenAffordanceId === 'peek' && t.label2) {
    confirm(p, t.label2.prop, true, s.minute);
    say(
      s,
      'narrator',
      `Later, the tape on ${nameOf(t.for)}’s parcel had been lifted and pressed back down.`,
      'event',
    );
  }
  // It reaches its owner in the evening, through the neighbour, with a word about where it came from.
  const owner = personOf(s, t.for);
  socialEvent(owner, {
    at: s.minute,
    kind: 'harm',
    otherId: KAPICI,
    byMe: false,
    magnitude: rec.chosenAffordanceId === 'peek' ? 0.3 : 0.1,
  });
  t.done = s.minute + 60;
}

function knock(s: GameState, who: Rid) {
  if (s.k.at !== `door:${who}` || s.k.walk) return;
  const r = rOf(s, who);
  const p = personOf(s, who);
  if (r.where === 'asleep') {
    tick(p, Math.max(p.now, s.minute));
    s.knocks++;
    socialEvent(p, {
      at: s.minute,
      kind: 'insult',
      otherId: KAPICI,
      byMe: false,
      magnitude: 0.2 + 0.15 * s.knocks,
    });
    r.where = 'home';
    r.until = s.minute + 10;
    if (s.knocks === 1) {
      say(s, who, 'I’ve been on shift all night. What is it?', 'voice');
      say(s, 'riza', 'Derya sleeps till three. Bread on the hook, never the bell.', 'margin');
    } else if (s.knocks === 2) {
      say(s, who, 'Again? Do you know what time I got in?', 'voice');
      say(s, 'narrator', 'Across the landing, Burak’s door opened an inch and closed again.', 'event');
      believeSelf(personOf(s, 'burak'), 'kapici:kind', false, 0.65, s.minute);
    } else {
      say(s, who, 'That’s it. I’m telling Burak Bey.', 'voice');
      for (const o of ['burak', 'hacer'] as const)
        believeSelf(personOf(s, o), 'kapici:kind', false, 0.7, s.minute);
    }
    deliverAt(s, s.k.at);
    // Back to sleep after.
    r.until = s.minute + 6;
  } else if (r.where !== 'home') say(s, 'narrator', 'No answer.', 'journal');
  else say(s, 'narrator', `${nameOf(who)} is already at the door.`, 'journal');
}

function prank(s: GameState, what: 'swap' | 'gate') {
  if (s.phase !== 'day') return;
  const witnesses = s.residents.filter(
    (r) => r.where === 'step' || (r.id === 'hacer' && r.where === 'home') || r.stairsUntil >= s.minute,
  );
  if (what === 'gate') {
    if (s.k.at !== 'step' && s.k.at !== 'room' && s.k.at !== 'landing:0') {
      say(s, 'narrator', 'The courtyard gate is downstairs, by the step.', 'journal');
      return;
    }
    s.gateUntil = s.minute + 90;
    say(s, 'narrator', 'You left the courtyard gate on the latch.', 'journal');
    stamp(s, 'gate');
  } else {
    // Swap Hacer's and Sevim's newspapers: only while both papers are in the basket.
    const n = s.tasks.find((t) => t.kind === 'bread' && t.for === 'hacer' && t.carried && !t.done);
    const v = s.tasks.find((t) => t.kind === 'bread' && t.for === 'sevim' && t.carried && !t.done);
    if (!n || !v || s.swappedDay === today(s)) {
      say(
        s,
        'narrator',
        s.swappedDay === today(s)
          ? 'Once a day is plenty.'
          : 'You need both Hacer’s and Sevim’s papers in the basket.',
        'journal',
      );
      return;
    }
    s.swappedDay = today(s);
    say(
      s,
      'narrator',
      'You swapped Hacer’s and Sevim’s newspapers. Each has the other’s crossword.',
      'journal',
    );
    stamp(s, 'swap');
    for (const [a, b] of [
      ['hacer', 'sevim'],
      ['sevim', 'hacer'],
    ] as const) {
      const p = personOf(s, a);
      perceive(p, [
        {
          at: s.minute + 60,
          channel: 'saw',
          kind: 'mixup',
          salience: 0.6,
          valence: -0.1,
          summary: `${nameOf(b)}’s pen marks on my crossword`,
          claims: [{ prop: `${b}:nosy`, value: true, confidence: 0.7 }],
        },
      ]);
    }
  }
  const seen = witnesses.find((w) => w.id !== 'derya');
  if (seen) {
    const p = personOf(s, seen.id);
    believeSelf(p, 'kapici:reliable', false, 0.6, s.minute);
    say(s, 'narrator', `${nameOf(seen.id)} saw you do it.`, 'event');
  }
}

// ---------- v4 hidden resident stories ----------

function trustedStoryListener(s: GameState, who: Rid): boolean {
  const p = personOf(s, who);
  // Confidence follows experienced social trust. Source trust still weights testimony separately.
  const relationship = relationshipWith(p, KAPICI);
  return relationship.trust >= 0.58 && relationship.affection >= 0.12;
}

function storyClue(s: GameState, who: Rid, prop: string, words: string) {
  if (s.secrets[prop] !== undefined) return;
  perceive(s.kapici, [
    {
      at: s.minute,
      channel: 'told',
      kind: 'fact',
      actorId: who,
      salience: 0.9,
      summary: words,
      claims: [{ prop, value: true, confidence: 0.95 }],
    },
  ]);
  learn(s, prop);
  say(s, who, words, 'voice');
  say(s, 'narrator', 'A new line in the notebook.', 'event');
}

function storySitting(s: GameState, who: Rid, topic?: 'boundaries') {
  if (!s.stories || rOf(s, who).sits < 3 || !trustedStoryListener(s, who)) return;
  if (who === 'hacer' || who === 'sevim') storyClue(s, who, STORY_FACTS[who], STORY_LINES[who]);
  if (who !== 'derya' || topic === 'boundaries') storyClue(s, who, PRIVATE_FACTS[who], PRIVATE_LINES[who]);
  if (who === 'tarik') storyClue(s, who, STORY_FACTS.instalments, STORY_LINES.instalments);
  if (who === 'burak' && s.boilerBroken && !s.stories.fund.bookRead) {
    s.stories.fund.bookRead = true;
    storyClue(s, who, STORY_FACTS.book, STORY_LINES.book);
  }
}

/** A specific discovered account can be passed on; guessing a fact cannot unlock a story. */
function storyTell(s: GameState, who: Rid, prop: string, value: boolean): boolean {
  if (!s.stories || !Object.values(STORY_FACTS).some((fact) => fact === prop)) return false;
  if (!value || s.secrets[prop] === undefined) return false;
  const f = s.stories.feud;
  if (who === 'sevim' && prop === STORY_FACTS.hacer) f.hacerPassed = true;
  else if (who === 'hacer' && prop === STORY_FACTS.sevim) f.sevimPassed = true;
  else if (who === 'burak' && prop === STORY_FACTS.instalments) s.stories.fund.consentPassed = true;
  else return false;
  // Keep the testimony in HF and the ordinary ledger, so it remains ordinary gossip too.
  deliverClaim(s, who, prop, true, 0.95, false);
  say(
    s,
    who,
    who === 'burak'
      ? 'He asked you to tell me? Ask me about the fund again. I’ll have the book ready.'
      : 'That is not how I remember it. Let me think. Perhaps we should speak ourselves.',
    'voice',
  );
  return true;
}

function storyNews(s: GameState, who: Rid): boolean {
  const fund = s.stories?.fund;
  if (who !== 'burak' || !fund || !s.boilerBroken || !trustedStoryListener(s, who)) return false;
  if (rOf(s, who).sits >= 2 && !fund.bookRead) {
    fund.bookRead = true;
    storyClue(s, who, STORY_FACTS.book, STORY_LINES.book);
    return true;
  }
  if (!fund.bookRead || !fund.consentPassed || fund.agreed) return false;
  // The engineer can still come on Saturday evening; later requests stay unresolved this week.
  if (today(s) > 6 || (today(s) === 6 && tod(s) > 18 * 60)) return false;
  fund.agreed = true;
  fund.repairAt = today(s) < 6 ? dayStart(today(s) + 1) + 10 * 60 : dayStart(6) + 19 * 60;
  say(s, who, STORY_LINES.agreement, 'voice');
  return true;
}

function storyEvents(s: GameState) {
  if (!s.stories) return;
  const { feud, fund } = s.stories;
  if (!feud.reconciled && feud.hacerPassed && feud.sevimPassed && today(s) === 6 && tod(s) >= 17 * 60) {
    feud.reconciled = true;
    for (const [a, b] of [
      ['hacer', 'sevim'],
      ['sevim', 'hacer'],
    ] as const) {
      socialEvent(personOf(s, a), { at: s.minute, kind: 'gift', otherId: b, byMe: false, magnitude: 0.8 });
    }
    say(s, 'narrator', STORY_LINES.tea, 'event');
    stamp(s, 'two_cups');
  }
  if (fund.agreed && !fund.repaired && fund.repairAt !== null && s.minute >= fund.repairAt) {
    fund.repaired = true;
    s.boilerBroken = false;
    say(s, 'narrator', STORY_LINES.repair, 'event');
    stamp(s, 'warm_stairs');
  }
}

// ---------- arcs ----------

function boilerFound(s: GameState) {
  s.boilerBroken = true;
  say(s, 'narrator', 'The boiler’s pump has gone. A new one is ₺2,400. Burak Bey went pale.', 'event');
  const p = personOf(s, 'burak');
  perceive(s.kapici, [
    {
      at: s.minute,
      channel: 'told',
      kind: 'fact',
      actorId: 'burak',
      salience: 0.8,
      summary: 'the fund is thin',
      claims: [{ prop: FACTS.fund, value: true, confidence: 0.9 }],
    },
  ]);
  learn(s, FACTS.fund);
  say(s, 'burak', 'The fund is thin. Some flats are behind. I won’t say who.', 'voice');
  for (const r of RIDS) if (r !== 'burak') believeSelf(personOf(s, r), FACTS.fund, true, 0.6, s.minute);
  // Hacer wonders where the money went.
  const n = personOf(s, 'hacer');
  perceive(n, [
    {
      at: s.minute,
      channel: 'saw',
      kind: 'fact',
      salience: 0.5,
      summary: 'no hot water again',
      claims: [{ prop: 'burak:dishonest', value: true, confidence: 0.62 }],
    },
  ]);
  void p;
}

function tarikEnvelope(s: GameState) {
  s.tarik.envelope = true;
  perceive(s.kapici, [
    {
      at: s.minute,
      channel: 'saw',
      kind: 'fact',
      salience: 0.9,
      summary: 'Tarık’s envelope for the dues',
      claims: [{ prop: FACTS.dues, value: true, confidence: 0.95 }],
    },
  ]);
  learn(s, FACTS.dues);
  say(
    s,
    'tarik',
    'Take this down to Burak for me. Part of my dues. Don’t say anything to anyone, evladım. My pension is late again.',
    'voice',
  );
  stamp(s, 'envelope');
}

function nightEvents(s: GameState, day: number) {
  // Tuesday to Thursday: a man rings flat 5 near midnight. From your window you see him; so does Hacer.
  if (day >= 2 && day <= 4 && !(s.oneCast?.departure && !s.oneCast.admission)) {
    perceive(s.kapici, [
      {
        at: s.minute,
        channel: 'saw',
        kind: 'fact',
        salience: 0.8,
        summary: 'a man at flat 5',
        claims: [{ prop: FACTS.visitor, value: true, confidence: 0.9 }],
      },
    ]);
    learn(s, FACTS.visitor);
    const lines: Record<number, string> = {
      2: 'Near midnight a man rang flat 5. Derya let him in, and looked down the stairs before she shut the door.',
      3: 'The same man at flat 5 again, late. He carried a bag this time. Hacer’s curtain moved.',
      4: 'Flat 5 again after eleven. You heard him laugh on the landing, and Derya say “shh”.',
    };
    say(s, 'narrator', lines[day] ?? '', 'event');
    const n = personOf(s, 'hacer');
    perceive(n, [
      {
        at: s.minute,
        channel: 'saw',
        kind: 'fact',
        salience: 0.8,
        summary: 'a man at Derya’s',
        claims: [{ prop: FACTS.visitor, value: true, confidence: 0.9 }],
      },
    ]);
  }
}

function ringEvening(s: GameState) {
  s.ring.asked = true;
  const discovered = s.secrets['burak:paper_mechanisms'] !== undefined;
  s.ring.answer = discovered ? 'yes' : 'not yet';
  if (discovered) {
    say(
      s,
      'burak',
      'The little ferry moves when you pull this tab. Hold the harbour fold for me? I would rather show one person than announce it to the building.',
      'voice',
    );
    stamp(s, 'paper_ferry');
  } else {
    say(
      s,
      'narrator',
      'Burak spent Saturday evening at his own table. You did not learn what he was making.',
      'event',
    );
  }
}

function meeting(s: GameState) {
  // Sunday 11:00 in flat 3. Burak opens the fund book: the money is all there, and short, and he will not say why.
  s.minute = dayStart(7) + MEETING;
  say(s, 'narrator', 'Sunday. The residents’ meeting in Burak Bey’s flat. Tea, the good glasses.', 'journal');
  for (const id of RIDS) {
    const p = personOf(s, id);
    if (id === 'derya' && s.oneCast?.departure && !s.oneCast.admission) continue;
    tick(p, Math.max(p.now, s.minute));
    confirm(p, 'burak:dishonest', false, s.minute);
    confirm(p, FACTS.fund, true, s.minute);
  }
  say(
    s,
    'burak',
    s.stories?.fund.repaired
      ? 'Here is the pump invoice and the deposit. The balance is due next week. The private repayment arrangement is in hand.'
      : 'Here is the book. Every kuruş. One flat is behind, and that is their business.',
    'voice',
  );
  const duesOut = RIDS.filter(
    (id) => id !== 'burak' && id !== 'tarik' && credence(personOf(s, id), FACTS.dues) >= 0.7,
  );
  if (duesOut.length >= 2) {
    say(s, 'narrator', 'Everyone looked at Tarık Bey. He looked at his tea.', 'event');
    const t = personOf(s, 'tarik');
    socialEvent(t, { at: s.minute, kind: 'harm', otherId: KAPICI, byMe: false, magnitude: 0.4 });
  }
  // The vote on the kapıcı's tea money: each resident's own decision.
  let yes = 0;
  let no = 0;
  for (const id of RIDS) {
    const r = rOf(s, id);
    const p = personOf(s, id);
    if (
      id === 'derya' &&
      ((s.oneCast?.departure && !s.oneCast.admission) || relationshipWith(p, KAPICI).affection < -0.1)
    ) {
      r.vote = 'away';
      continue;
    }
    const offers = [
      offer('vote_yes', {
        action: 'help',
        label: 'raise the kapıcı’s tea money',
        duration: 2,
        targetId: KAPICI,
        tags: ['help'],
        // Gratitude for a week's service: a resident the kapıcı served well feels a pull to return it.
        advertises: { belonging: 0.05 },
        material: -0.5 + GRATITUDE * Math.max(0, relationshipWith(p, KAPICI).affection - 0.12),
      }),
      offer('vote_no', {
        action: 'wait',
        label: 'keep it as it is',
        duration: 2,
        advertises: { safety: 0.04 } as never,
      }),
    ];
    const rec = decide(p, offers, { now: s.minute });
    if (rec.chosenAffordanceId === 'vote_yes') {
      r.vote = 'yes';
      yes++;
      begin(p, offers[0] as Affordance, rec);
      tick(p, s.minute + 2);
      finish(p, { affordanceId: 'vote_yes', action: 'help', status: 'completed', at: s.minute + 2 });
    } else {
      r.vote = 'no';
      no++;
    }
  }
  const raise = yes >= 4;
  s.meeting = { done: true, yes, no, raise };
  if (raise) {
    s.k.money += 300;
    stamp(s, 'raise');
  }
  say(
    s,
    'narrator',
    raise
      ? `The tea money goes up: ${yes} hands. Burak Bey counts ₺300 into your tin.`
      : `The tea money stays as it is: ${yes} hands for, ${no} against.`,
    'event',
  );
}

// ---------- the day ----------

function turnPage(s: GameState) {
  if (s.phase === 'night') {
    const next = today(s) + 1;
    if (next === 7) {
      s.phase = 'sunday';
      meeting(s);
      return;
    }
    s.minute = dayStart(next) + DAY_START;
    s.phase = 'day';
    morning(s, next);
    return;
  }
  if (s.phase === 'sunday') s.phase = 'end';
}

function morning(s: GameState, day: number) {
  for (const r of s.residents) {
    const info = RESIDENTS[r.id];
    r.where = info.nights && day <= 6 ? 'work' : 'home';
    r.until = s.minute + 15 + ((RIDS.indexOf(r.id) * 11 + day * 5) % 40);
    if (info.nights && day > 1 && day <= 6) r.until = s.minute + 60;
    r.stairsUntil = 0;
  }
  s.k.at = 'room';
  s.k.walk = null;
  s.k.busyTask = null;
  // Sleep on it: everyone (and the kapıcı's legs) through the night.
  for (const p of [...s.people, s.kapici]) {
    if (s.version === GAME_VERSION && p.id === 'derya') {
      if (s.oneCast?.departure && !s.oneCast.admission) continue;
      tick(p, Math.max(p.now, s.minute));
      continue;
    }
    if (p.activity)
      finish(p, {
        affordanceId: p.activity.affordanceId,
        action: p.activity.action,
        status: 'completed',
        at: Math.max(p.now, p.activity.startedAt),
      });
    hostMeal(p, Math.max(p.now, s.minute - 10 * 60 - 30));
    const sleep = offer('sleep', {
      action: 'sleep',
      mode: 'sleep',
      duration: Math.max(60, s.minute - p.now - 30),
      advertises: { sleep: 0.8, rest: 0.5 },
    });
    const rec = decide(p, [sleep], { now: Math.max(p.now, s.minute - 9 * 60) });
    if (rec.chosenAffordanceId === 'sleep' && begin(p, sleep, rec)) {
      tick(p, s.minute - 5);
      finish(p, { affordanceId: 'sleep', action: 'sleep', status: 'completed', at: s.minute - 5 });
    }
    hostMeal(p, s.minute - 30);
    tick(p, s.minute);
  }
  planDay(s, day);
  const lines: Record<number, string> = {
    2: 'Tuesday. A courier is due before noon.',
    3: 'Wednesday. The radiators are cold this morning.',
    4: 'Thursday. Somebody has been talking on the step about flat 5.',
    5: 'Friday. Tarık Bey goes down for Friday prayer at half past twelve, slowly.',
    6: 'Saturday. Burak is home all day and has ironed a shirt.',
  };
  say(s, 'narrator', lines[day] ?? DAY_NAMES[day - 1] ?? '', 'journal');
  if (day === 3)
    say(s, 'riza', 'If the boiler goes, look at the pump first. Then look at Burak’s face.', 'margin');
  if (day === 4) say(s, 'riza', 'What Hacer sees at night, the step hears by noon.', 'margin');
}

/** Dinner, breakfast: the host feeds everyone at home (no choice offered). */
function hostMeal(p: Person, at: number) {
  const aff = offer('meal', { action: 'eat', duration: 20, advertises: { food: 0.6, water: 0.5 } });
  const rec = decide(p, [aff], { now: Math.max(p.now, at) });
  if (rec.chosenAffordanceId !== 'meal' || !begin(p, aff, rec)) return;
  tick(p, p.now + 20);
  finish(p, {
    affordanceId: 'meal',
    action: 'eat',
    status: 'completed',
    at: p.now,
    needs: { food: 0.6, water: 0.6 },
  });
}

/** Rıza's Saturday-night estimate of a hand at the meeting: the host's guess from warmth, word and doubt, not a ruling. */
export function handsLean(s: GameState, id: Rid): 'likely' | 'maybe' | 'unlikely' {
  const p = personOf(s, id);
  const r = rOf(s, id);
  const aff = relationshipWith(p, KAPICI).affection;
  const doubt = credence(p, 'kapici:dishonest');
  if (doubt >= 0.65 || aff < 0) return 'unlikely';
  if ((r.word === 'yes' && aff > 0.1) || aff > 0.24) return 'likely';
  return aff > 0.1 || r.word === 'yes' ? 'maybe' : 'unlikely';
}

function endDay(s: GameState) {
  const day = today(s);
  const rep = report(s);
  for (const t of s.tasks)
    if (!t.done && dayOf(t.from) === day && t.kind === 'bins') {
      t.done = s.minute;
      rep.missed++;
      say(s, 'narrator', 'Nobody took the bins down. The landing smelled of it all night.', 'journal');
      for (const r of s.residents)
        socialEvent(personOf(s, r.id), {
          at: s.minute,
          kind: 'harm',
          otherId: KAPICI,
          byMe: false,
          magnitude: 0.05,
        });
    }
  for (const t of s.tasks)
    if (!t.done && dayOf(t.from) === day && t.kind !== 'bins') {
      rep.missed++;
      const p = personOf(s, t.for);
      socialEvent(p, { at: s.minute, kind: 'harm', otherId: KAPICI, byMe: false, magnitude: 0.15 });
      believeSelf(p, 'kapici:reliable', false, 0.65, s.minute);
      t.done = s.minute;
      say(
        s,
        'narrator',
        `${nameOf(t.for)}: ${t.label}, not done today. ${t.carried ? 'You left it by their door for the morning.' : 'They will have sorted it themselves.'} They noticed.`,
        'journal',
      );
    }
  rep.talks = s.talks.filter((t) => dayOf(t.at) === day).length;
  rep.caught = [
    ...new Set(s.residents.filter((r) => r.caught.some((m) => dayOf(m) === day)).map((r) => r.id)),
  ];
  // The cat: if the gate was open today, the stray came in. Hacer feeds it; Burak names it; Sevim sneezes.
  if (s.gateUntil > dayStart(day)) {
    s.catDays++;
    say(
      s,
      'narrator',
      s.catDays === 1
        ? 'The ginger stray came in through the gate. Hacer fed it. Sevim sneezed at it.'
        : 'The ginger cat again. Burak has started calling it Pamuk.',
      'event',
    );
    socialEvent(personOf(s, 'sevim'), {
      at: s.minute,
      kind: 'harm',
      otherId: KAPICI,
      byMe: false,
      magnitude: 0.08,
    });
    socialEvent(personOf(s, 'burak'), {
      at: s.minute,
      kind: 'gift',
      otherId: KAPICI,
      byMe: false,
      magnitude: 0.2,
    });
    socialEvent(personOf(s, 'hacer'), {
      at: s.minute,
      kind: 'gift',
      otherId: KAPICI,
      byMe: false,
      magnitude: 0.1,
    });
    if (s.catDays >= 2 && !s.catHome) {
      s.catHome = true;
      say(s, 'narrator', 'Burak bought a bowl. Pamuk is the building’s cat now.', 'event');
      stamp(s, 'cat');
    }
  }
  // A promise made to a man you now think a liar: it shows on the stairs before Sunday.
  for (const r of s.residents) {
    if (r.word !== 'yes') continue;
    if (credence(personOf(s, r.id), 'kapici:dishonest') < 0.65) continue;
    r.word = 'no';
    const why = r.caught.length
      ? 'they caught you telling two stories'
      : r.grudges.some((g) => g.lie)
        ? 'what you said about them got back to them'
        : 'the step says you are not straight with people';
    say(
      s,
      'narrator',
      `${nameOf(r.id)} would not meet your eye on the stairs: ${why}. You would not count on that word for Sunday.`,
      'event',
    );
  }
  if (day === 6) {
    const likely = s.residents.filter((r) => handsLean(s, r.id) === 'likely').map((r) => nameOf(r.id));
    const maybe = s.residents.filter((r) => handsLean(s, r.id) === 'maybe').map((r) => nameOf(r.id));
    say(
      s,
      'riza',
      `Count the hands before you sleep. ${likely.length ? `${likely.join(', ')}: likely.` : 'Nobody you can be sure of.'} ${maybe.length ? `${maybe.join(', ')}: maybe.` : ''} Four hands raise the tea money.`,
      'margin',
    );
  }
  s.phase = 'night';
  s.minute = dayStart(day) + DAY_END;
  if (day === 6 && !s.ring.asked) {
    s.minute = dayStart(day) + 18 * 60 + 30;
    ringEvening(s);
    s.minute = dayStart(day) + DAY_END;
  }
  nightEvents(s, day);
}

export function step(s: GameState): void {
  if (s.phase !== 'day') return;
  applyPending(s);
  if (s.phase !== 'day') return;
  s.minute += 1;
  const t = tod(s);
  const d = today(s);
  if (d === 6 && t === 18 * 60 + 30 && !s.ring.asked) ringEvening(s);
  if (d === 3 && t === 10 * 60) waterOff(s);
  for (const r of s.residents) residentMinute(s, r);
  kapiciMinute(s);
  storyEvents(s);
  if (t >= DAY_END) endDay(s);
}

function waterOff(s: GameState) {
  // The water notice on the board came true: anyone the kapıcı told sees his word was good.
  for (const r of s.residents) {
    const p = personOf(s, r.id);
    const toldIt = r.told.some((x) => x.prop === 'notice:water' && x.value);
    confirm(p, 'notice:water', true, s.minute);
    if (!toldIt && r.where === 'home') {
      socialEvent(p, { at: s.minute, kind: 'harm', otherId: KAPICI, byMe: false, magnitude: 0.08 });
    }
  }
  say(
    s,
    'narrator',
    'Ten o’clock: the water went off, as the notice said. Somebody upstairs shouted that nobody told them.',
    'event',
  );
}

function applyPending(s: GameState) {
  while (s.applied < s.inputs.length) {
    const inp = s.inputs[s.applied] as Input;
    if (inp.at > s.minute) break;
    s.applied++;
    applyInput(s, inp);
  }
}

/** Queue an input at the current minute and apply it. */
export function act(s: GameState, inp: NewInput) {
  s.inputs.push({ ...inp, at: s.minute } as Input);
  applyPending(s);
}

export function replay(
  seed: number,
  inputs: readonly Input[],
  until?: number,
  edition = GAME_VERSION,
  admission?: DeryaReturnAdmission,
): GameState {
  let s = newGame(seed, edition);
  let suffix = inputs;
  if (admission) {
    const prefix = admission.prefix;
    if (
      seed !== prefix.seed ||
      edition !== prefix.edition ||
      JSON.stringify(inputs.slice(0, prefix.inputs.length)) !== JSON.stringify(prefix.inputs) ||
      (until !== undefined && until < prefix.minute)
    )
      throw new Error('One cast: return replay prefix mismatch');
    s = applyDeryaReturn(replay(seed, prefix.inputs, prefix.minute, edition), admission);
    suffix = inputs.slice(prefix.inputs.length);
  }
  for (const inp of suffix) {
    while (s.phase === 'day' && s.minute < inp.at) step(s);
    s.inputs.push(inp);
    applyPending(s);
  }
  if (until !== undefined) while (s.phase === 'day' && s.minute < until) step(s);
  return s;
}

export const canReplay = (game: string | undefined): boolean => game === GAME_VERSION;

export function fingerprint(s: GameState): string {
  const people = s.people.map((p) => ({
    id: p.id,
    now: p.now,
    b: p.memory.beliefs.length,
    t: trustOf(p, KAPICI).toFixed(4),
  }));
  return JSON.stringify({
    m: s.minute,
    ph: s.phase,
    money: s.k.money,
    at: s.k.at,
    people,
    talks: s.talks.length,
    said: s.said.length,
    meeting: s.meeting,
  });
}

// ---------- reads for the UI ----------

/** The kapıcı's read of a resident, in words (never a number): warmth to him and how much his word weighs. */
export function readOf(s: GameState, id: Rid): { warmth: string; word: string } {
  const p = personOf(s, id);
  const a = relationshipWith(p, KAPICI).affection;
  const w = trustOf(p, KAPICI);
  const lie = credence(p, 'kapici:dishonest');
  const warmth =
    a > 0.35 ? 'fond of you' : a > 0.12 ? 'warm' : a > -0.08 ? 'polite' : a > -0.25 ? 'cool' : 'cold';
  const word =
    lie >= 0.65
      ? 'thinks you lie'
      : lie >= 0.55 && w >= 0.45
        ? 'not sure of you'
        : w >= 0.72
          ? 'takes your word'
          : w >= 0.58
            ? 'listens to you'
            : w >= 0.45
              ? 'not sure of you'
              : 'doubts you';
  return { warmth, word };
}

export function openTasks(s: GameState): Task[] {
  return s.tasks.filter((t) => !t.done && t.from <= s.minute);
}

export { INVENTABLE };
