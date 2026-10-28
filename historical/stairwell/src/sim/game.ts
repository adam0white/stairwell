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
 * Edition11 opts into an authored four-week month, meeting invitations, storm and private errands.
 * Does not cover: residents’ families outside, generic planning or private publication.
 */
import {
  type Affordance,
  applyReputationBelief,
  begin,
  bodyForecast,
  confirm,
  contradicted,
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
  restore,
  type Suggestion,
  seedSourceTrust,
  snapshot,
  socialEvent,
  tick,
  trustOf,
} from '@adam0white/human-framework';
import { lifeAdmission } from '@adam0white/lab-client';
import { CALENDAR_ACTIONS, type CastChapter } from './cast-life.ts';
import {
  MONTH_VERSION,
  type MonthState,
  type MonthVisit,
  newMonth,
  PRIVATE_WORK,
  RELAY_POLICY,
  WORK_START_VERSION,
} from './month.ts';
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
export const GAME_VERSION = 'stairwell@9';
export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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
  custody?: Rid;
  custodyAt?: number;
  custodyMissed?: boolean;
  storyFor?: Rid;
  /** A parcel's label says something: the proposition the kapıcı learns by carrying it. */
  label2?: { prop: string; text: string };
  /** Left on the door hook (nobody answered). */
  hook?: boolean;
}

export type Where = 'paused' | 'home' | 'asleep' | 'step' | 'shop' | 'work' | 'roof' | `visit:${Rid}`;

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
  month?: MonthState;
  castChapter?: CastChapter;
  castPauses?: Partial<Record<Rid, 'requested' | 'paused'>>;
  lifeNotes?: Partial<Record<Rid, string>>;
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
  | { at: number; kind: 'start-work'; task: number }
  | { at: number; kind: 'news'; who: Rid }
  | { at: number; kind: 'tell'; who: Rid; prop: string; value: boolean; sure: boolean }
  | { at: number; kind: 'invent'; who: Rid; about: Rid; trait: string }
  | { at: number; kind: 'word'; who: Rid }
  | { at: number; kind: 'cast-pause'; who: Rid }
  | { at: number; kind: 'sit'; who: Rid; topic?: 'boundaries' }
  | { at: number; kind: 'misdeliver' | 'entrust'; who: Rid; task: number }
  | { at: number; kind: 'help-story'; who: Rid }
  | { at: number; kind: 'repayment' }
  | { at: number; kind: 'seat'; who: Rid; beside: Rid }
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
const weekday = (s: GameState) => (s.month ? ((today(s) - 1) % 7) + 1 : today(s)); // day1 Monday
function requiredSimValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

export const dayName = (day: number) =>
  requiredSimValue(DAY_NAMES[(day - 1) % 7], 'The requested day has no weekday name.');
export const dayLabel = (s: GameState) =>
  `${s.month ? `Week ${Math.ceil(today(s) / 7)} · ` : ''}${dayName(today(s))}`;
const sunday = (s: GameState) => (s.month ? Math.ceil(today(s) / 7) * 7 : 7);
export const raining = (s: GameState) => !!s.month && today(s) === 9 && tod(s) >= 960 && tod(s) < 1000;

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
  { prop: 'hacer:nosy', value: true, title: 'Ms Hacer sees everyone who passes the door.' },

  { prop: 'tarik:kind', value: true, title: 'Mr Tarık would give you his last lemon candy.' },

  { prop: FACTS.ring, value: true, title: 'A parcel of paper-making supplies came for Burak.' },

  { prop: FACTS.fund, value: true, title: 'The boiler fund has too little money.' },
  { prop: FACTS.dues, value: true, title: 'Mr Tarık is late with his building payments.' },
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
    label: 'his shopping: bread, olives and tea',
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
    label: 'Water his plants. The key is under the mat.',
    place: 'door:burak',
    work: 6,
    window: [10 * 60, 17 * 60],
  },
  { for: 'tarik', label: 'fix his dripping tap', place: 'door:tarik', work: 18, window: [11 * 60, 18 * 60] },
];

function unfinishedTask(t: Task): string {
  const name = nameOf(t.for);
  if (t.kind === 'bread' || t.kind === 'parcel') return `You did not deliver ${t.label} to ${name} today.`;
  if (t.label === 'pick up her pharmacy bag') return `You did not deliver ${name}’s pharmacy bag today.`;
  if (t.label === 'his shopping: bread, olives and tea')
    return `You did not bring ${name} bread, olives and tea today.`;
  if (t.label === 'Water his plants. The key is under the mat.')
    return `You did not water ${name}’s plants today.`;
  if (t.label === 'look at the boiler because there is no hot water')
    return `You did not check the boiler for ${name} today. There was no hot water.`;
  const action = t.label
    .replace(/[.!?]$/, '')
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/\b(his|her)\b/g, `${name}’s`);
  return `You did not ${action}${action.includes(`${name}’s`) ? '' : ` for ${name}`} today.`;
}

export function planDay(s: GameState, day: number) {
  const d = dayStart(day);
  const r = (kind: number, i: number) => hashUnit(s.seed, kind, day, i);
  // Bread and newspapers: everyone wants them early. Derya's hangs on her door while she sleeps.
  for (const [i, id] of RIDS.entries()) {
    if (s.castPauses?.[id] === 'paused') continue;
    if (id === 'burak' && (s.month ? ((day - 1) % 7) + 1 : day) === 6) continue;
    const loaves = 1 + Math.floor(r(DRAW.bread, i) * 2);
    const by = d + 7 * 60 + 55 + Math.floor(r(DRAW.bread, i + 20) * 35);
    addTask(s, {
      kind: 'bread',
      for: id,
      label: `${loaves === 1 ? 'a loaf of bread' : 'two loaves of bread'}${RESIDENTS[id].paper ? ' and a newspaper' : ''}`,
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
    if (!job || s.castPauses?.[job.for] === 'paused') continue;
    if (job.for === 'burak' && (s.month ? ((day - 1) % 7) + 1 : day) === 6) continue;
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
    label: 'Take the bins down from the top floor. Put them outside by 20:45.',
    pickup: `landing:${TOP_FLOOR}`,
    place: 'step',
    from: d + 19 * 60 + 30,
    by: d + 20 * 60 + 45,
  });
  if (day === 3)
    addTask(s, {
      kind: 'job',
      for: 'burak',
      label: 'look at the boiler because there is no hot water',
      place: 'room',
      work: 20,
      from: d + 7 * 60 + 25,
      by: d + 10 * 60,
    });
}

// ---------- new game ----------

export function newGame(seed: number, edition = GAME_VERSION, chapter?: CastChapter): GameState {
  if (!canReplay(edition))
    throw new Error(`This notebook belongs to an older edition. Start fresh. (${edition})`);
  if (edition === WORK_START_VERSION && chapter)
    throw new Error(
      'Character transfer is not available for this work option. Download a copy of your game.',
    );
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
  if (edition === MONTH_VERSION || edition === WORK_START_VERSION) s.month = newMonth();
  if (canReplay(edition)) {
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
  for (const sp of SECRET_PROPS.filter((sp) => ['hacer:nosy', 'tarik:kind'].includes(sp.prop)))
    learn(s, sp.prop);
  planDay(s, 1);
  say(
    s,
    'riza',
    'Deliver the bread first. Everyone wants it by eight, and everyone says their order comes first.',
    'margin',
  );
  say(
    s,
    'narrator',
    'It is Monday. This is your first day at Lale Apartmanı, the Lale apartment building. The bread order is on the board. Mr Burak’s notice says the water will be off on Wednesday from 10:00 to 12:00.',
    'journal',
  );
  if (chapter) {
    s.castChapter = structuredClone(chapter);
    s.lifeNotes = {};
    for (const input of chapter.inputs) {
      const id = Object.keys(chapter.initial).find(
        (id) => RESIDENTS[id as Rid].castId === input.parent.castId,
      ) as Rid | undefined;
      if (!id || !chapter.initial[id])
        throw new Error(
          'Some saved characters are missing from this chapter. Keep your file and start a new game.',
        );
      const index = s.people.findIndex((p) => p.id === id);
      s.people[index] = restore(
        snapshot(requiredSimValue(chapter.initial[id], 'The saved character disappeared from this chapter.')),
      );
      const life = lifeAdmission(input, 'stairwell');
      s.lifeNotes[id] = life.line;
      const resident = rOf(s, id);
      if (!RESIDENTS[id].nights && !RESIDENTS[id].work) {
        resident.where = life.life.place === 'public-garden' ? 'step' : life.startsAtHome ? 'home' : 'shop';
        resident.until = 480;
      }
      // Coarse assignment changes a real, optional afternoon errand, within the resident's role.
      if (life.availableForExtraWork || life.life.work === 'local-help')
        addTask(s, {
          kind: 'job',
          for: id,
          label: `Bring ${id === 'hacer' ? (input.life.assignment === 0 ? 'clean packaging' : 'a folded shop notice') : id === 'burak' ? 'a blank account sheet' : id === 'sevim' ? 'a clear notice draft' : id === 'tarik' ? 'a recorder battery' : 'supplies quietly to the door hook'}.`,
          place: `door:${id}`,
          from: 16 * 60,
          by: 19 * 60,
          work: 8,
        });
    }
  }

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
  if (raining(s) && (outside(from) || outside(to))) m += 6;
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
  if (raining(s))
    list.push(
      offer('shelter', {
        action: 'sit',
        label: 'wait under the shop awning',
        duration: 1000 - t,
        advertises: { rest: 0.3, belonging: 0.15 },
        with: atStep(s).filter((x) => x !== r.id),
      }),
    );
  if (s.castChapter?.initial[r.id]) {
    const p = personOf(s, r.id);
    for (const c of p.agenda.commitments)
      if (c.status === 'pending' && c.kind !== 'abstain' && c.from <= s.minute && c.until > s.minute) {
        const action = c.actions.find((a) => CALENDAR_ACTIONS.has(a));
        if (action)
          list.push(
            offer(`calendar:${c.id}`, {
              action,
              label: c.label ?? 'keep a quiet personal duty',
              duration: Math.min(10, c.until - s.minute),
              tags: action.startsWith('pray') ? ['worship'] : [],
              advertises: { meaning: 0.2 },
            }),
          );
      }
  }
  if (s.month) list.push(...monthVisitOffers(s, r));
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
  if (s.castPauses?.[r.id] === 'paused') return;
  if (s.month?.visits.some((v) => v.done === undefined && (v.actor === r.id || v.other === r.id))) return;
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
  if (s.castPauses?.[r.id] === 'requested') {
    const working = info.work && weekday(s) <= 5 && t >= info.work[0] && t < info.work[1];
    const nurseDuty = info.nights && (t < 15 * 60 + 30 || t >= 19 * 60 + 30);
    if (!working && !nurseDuty && !p.activity) {
      s.castPauses[r.id] = 'paused';
      r.where = 'paused';
      r.stairsUntil = 0;
      r.until = s.minute;
      say(
        s,
        r.id,
        'I am pausing this chapter here. I still have my unfinished duties. I will keep my private records.',
        'voice',
      );
      return;
    }
  }
  // Work and sleep are the host's: the timetable of a working life.
  const wd = weekday(s);
  if (info.work && wd <= 5 && t >= info.work[0] - 1 && t < info.work[1]) {
    moveTo(s, r, 'work', 'work', info.work[1] - t);
    return;
  }
  if (info.nights) {
    if (r.where === 'work' && t < 12 * 60) {
      if (canReplay(s.version) && s.oneCast?.departureRequested && s.minute === 480) {
        pauseDeryaRota(s);
        return;
      }
      moveTo(s, r, 'asleep', 'sleep', 15 * 60 + 30 - t);
      if (canReplay(s.version)) {
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
      if (canReplay(s.version) && !p.activity) {
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
      if (canReplay(s.version)) {
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
  if (s.month && (aff.id.startsWith('parcel-handover:') || aff.id === 'dues-payment')) {
    startMonthVisit(s, r, aff, rec);
    return;
  }
  begin(p, aff, rec);
  const mins = aff.duration;
  if (aff.id === 'home' || aff.id === 'meal' || aff.id.startsWith('calendar:')) {
    if (r.where !== 'home') moveTo(s, r, 'home', aff.id, mins);
    else r.until = s.minute + mins;
  } else if (aff.id === 'shelter') {
    moveTo(s, r, 'step', 'shelter', mins);
    say(s, 'narrator', `${nameOf(r.id)} chose to wait under the awning.`, 'event');
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
  if (s.castPauses?.[a] === 'paused' || s.castPauses?.[b] === 'paused') return;
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
        `${nameOf(a)} and ${nameOf(b)} were at ${where === 'step' ? 'the step' : where}. They did not speak.`,
        'journal',
      );
    s.talks.push({ at: s.minute, a, b, where, props: [], overheard: near });
    return;
  }
  const props: string[] = [];
  const heard: string[] = [];
  const received: { from: Rid; to: Rid; prop: string; value: boolean; originAt: number; lie: boolean }[] = [];
  for (const [sp, li] of [
    [pa, pb],
    [pb, pa],
  ] as const) {
    tick(sp, Math.max(sp.now, s.minute));
    tick(li, Math.max(li.now, s.minute));
    const res = converse(sp, li, {
      at: s.minute,
      traits: TRAITS,
      ...(s.month ? { provenance: true, loyalWarning: true, confidentMin: RELAY_POLICY[sp.id as Rid] } : {}),
      ...(maxClaims !== undefined ? { maxClaims } : {}),
    });
    for (const c of res.claims) {
      props.push(c.prop);
      if (s.month) {
        const previous = s.month.testimony.findLast(
          (x) => x.to === sp.id && x.prop === c.prop && x.value === c.value,
        );
        const retained = sp.memory.beliefs
          .find((x) => x.prop === c.prop)
          ?.sources.some((x) => x.id === previous?.from && x.value === c.value);
        const actuallyTold = res.told.some((pc) =>
          pc.claims?.some((x) => x.prop === c.prop && x.value === c.value),
        );
        const caretaker = retained && actuallyTold && !c.deceit ? previous?.caretaker : undefined;
        if (caretaker)
          received.push({
            from: sp.id as Rid,
            to: li.id as Rid,
            prop: c.prop,
            value: c.value,
            originAt: caretaker.at,
            lie: caretaker.lie,
          });
        s.month.testimony.push({
          from: sp.id,
          to: li.id as Rid,
          prop: c.prop,
          value: c.value,
          at: s.minute,
          ...(caretaker ? { caretaker } : {}),
        });
        if (
          c.about === li.id &&
          caretaker &&
          !rOf(s, li.id as Rid).grudges.some((g) => g.prop === c.prop && g.from === sp.id)
        )
          wordGetsBack(s, li.id as Rid, sp.id as Rid, c.prop, c.value, caretaker.lie);
      }
    }
    const before = res.told.flatMap((pc) =>
      (pc.claims ?? []).map((c) => ({ prop: c.prop, b: credence(li, c.prop) })),
    );
    perceive(li, res.told, s.month ? { reputationTraits: TRAITS } : undefined);
    if (!s.month) customReputation(li, before, s.minute);
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
      if (!props.includes(x.prop) || s.month) continue;
      const c = credence(personOf(s, li), x.prop);
      if ((x.value ? 1 - c : c) >= 0.75 && !rOf(s, li).caught.some((m) => s.minute - m < 600)) {
        doubtKapici(s, li, sp, x.prop, x.value);
      }
    }
  }
  if (s.month)
    for (const receipt of received) {
      const listener = personOf(s, receipt.to);
      const c = credence(listener, receipt.prop);
      const key = `${receipt.to}:${receipt.prop}:${receipt.value}:${receipt.originAt}`;
      if ((receipt.value ? 1 - c : c) >= 0.75 && !s.month.accusations.includes(key)) {
        s.month.accusations.push(key);
        doubtKapici(s, receipt.to, receipt.from, receipt.prop, receipt.value);
      }
    }
  // Word gets back: a friend of the subject who heard a story about them from you tells them who said it.
  for (const [x, subj] of [
    [a, b],
    [b, a],
  ] as const) {
    const px = personOf(s, x);
    if (s.month || relationshipWith(px, subj).affection <= 0.2) continue;
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
  if (caught && (!s.month || comparisonNew(s, a, b, received))) {
    t.caught = true;
    catchKapici(s, a, b);
  }
  const place = where === 'step' ? 'on the step' : where === 'the stairs' ? 'on the stairs' : `in ${where}`;
  if (near) {
    // Only what is new to you today; the rest is the hum of the building.
    const d0 = dayStart(today(s));
    const old = new Set(s.said.filter((x) => x.kind === 'heard' && x.at >= d0).map((x) => x.text));
    const fresh = heard.filter((h) => !old.has(h));
    const opener = `${nameOf(a)} and ${nameOf(b)} were talking ${place}. You could hear them.`;
    if (fresh.length === 0 && s.said.some((x) => x.at >= d0 && x.text === opener)) return;
    say(s, 'narrator', opener, 'journal');
    for (const h of fresh.slice(0, 4)) say(s, 'narrator', h, 'heard');
    if (fresh.length === 0)
      say(
        s,
        'narrator',
        heard.length
          ? pick(s, ['You have already heard these stories today.', 'They repeated the same stories.'])
          : pick(s, [
              'They talked only about the weather and the price of bread.',
              'They talked mostly about grandchildren.',
              'They talked about the price of tomatoes at the market.',
              'They talked about football, then the weather.',
              'They discussed whose turn it is to water the plants on the landing.',
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
  say(
    s,
    'narrator',
    `${nameOf(from)} repeated your comments about ${nameOf(subj)} to ${subj === 'burak' || subj === 'tarik' ? 'him' : 'her'}.`,
    'event',
  );
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
    if (!s.month) seedSourceTrust(p, KAPICI, trustOf(p, KAPICI) * 0.75);
    rOf(s, id).caught.push(s.minute);
  }
  stamp(s, 'caught');
  say(
    s,
    'narrator',
    `${nameOf(a)} and ${nameOf(b)} compared notes. They noticed that you told them different stories.`,
    'event',
  );
  say(
    s,
    'riza',
    'They always compare what you told them. Tell them the same thing or tell them nothing.',
    'margin',
  );
}

// ---------- words ----------

const TRAIT_WORDS: Record<string, [string, string]> = {
  stingy: ['is unwilling to spend money', 'is willing to spend money'],
  generous: ['is generous', 'is not generous'],
  nosy: ['asks about everyone’s private life', 'respects other people’s privacy'],
  kind: ['is kind', 'is not very kind'],
  cruel: ['can be cruel', 'is not cruel'],
  lazy: ['does nothing all day', 'is not lazy'],
  hardworking: ['works hard', 'does not work much'],
  honest: ['is honest', 'is not honest'],
  dishonest: ['is dishonest with people', 'is honest with people'],
  reliable: ['is reliable', 'is unreliable'],
  unreliable: ['is unreliable', 'is reliable'],
  owes: ['owes money', 'owes nothing'],
};

export function claimWords(prop: string, value: boolean, edition = LEGACY_GAME_VERSION): string {
  const privateWords = Object.hasOwn(PRIVATE_WORDS, prop) ? PRIVATE_WORDS[prop] : undefined;
  if (privateWords) return privateWords[value ? 0 : 1];
  const story =
    (canReplay(edition) || edition === PREVIOUS_GAME_VERSION) && Object.hasOwn(STORY_WORDS, prop)
      ? STORY_WORDS[prop]
      : undefined;
  if (story) return story[value ? 0 : 1];
  const [who, trait, other] = prop.split(':');
  if (prop === FACTS.ring)
    return value
      ? 'Burak had a parcel of paper-making supplies.'
      : 'Burak’s parcel contained nothing unusual.';
  if (prop === FACTS.visitor)
    return value ? 'A man comes to Derya’s door late at night.' : 'Nobody comes to Derya’s at night.';
  if (prop === 'derya:brother')
    return value ? 'The man at Derya’s is her brother.' : 'That man is not her brother.';
  if (prop === FACTS.fund)
    return value ? 'The boiler fund has too little money.' : 'The boiler fund has enough money.';
  if (prop === 'notice:water')
    return value ? 'The water will be off on Wednesday from 10:00 to 12:00.' : 'The water is not going off.';
  if (prop === 'hacer:sevim') return 'Hacer and Sevim disagree about a notice.';
  if (who === 'kapici') {
    const w = TRAIT_WORDS[trait ?? '']?.[value ? 0 : 1] ?? trait;
    return `The new caretaker ${w}.`;
  }
  if (trait === 'sweet' && other)
    return value
      ? `${nameOf(who ?? '')} has romantic feelings for ${nameOf(other)}.`
      : `${nameOf(who ?? '')} does not have romantic feelings for ${nameOf(other)}.`;
  if (trait === 'owes')
    return value
      ? `${nameOf(who ?? '')} is late with the building payments.`
      : `${nameOf(who ?? '')} owes nothing.`;
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
    return s.castPauses?.[id] !== 'paused' && r.where === 'home' ? [id] : [];
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
    if (t.done || t.carried || t.custody || t.pickup !== pl || t.from > s.minute) continue;
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
        'These are paper supplies. The label tells you what arrived. It does not tell you what he is making. Let him choose whether to show you.',
        'margin',
      );
    }
  }
}

/** A task is done: the resident's thanks (HF social event) and their tip, which depends on how they feel about you. */
/** What each resident says at the door when the job is done: their own words, varied, so no line repeats often. */
const THANKS: Record<Rid, string[]> = {
  hacer: [
    'Ah, there you are. Will you sit for a minute? No? You are always busy.',
    'You are a good boy. Rıza was never this quick.',
    'Leave it on the stool. Be careful around the cat, if there is a cat.',
  ],
  sevim: [
    'Thank you. You got it exactly right, for once.',
    'Put it there, please. Be careful of the mat.',
    'You arrived on time. I noticed.',
  ],
  burak: ['Thanks, my friend. I mean it.', 'That is perfect. Thank you.', 'You have helped me so much.'],
  derya: ['You’re kind. Thank you.', 'Oh, thank you. I am very tired.', 'Thank you. I mean it.'],
  tarik: [
    'Thank you, son. These stairs are hard for me.',
    'May your legs stay strong. Thank you for coming up here.',
    'Thank you. Sit a minute, if you can.',
  ],
};
const JOB_THANKS: Record<Rid, string[]> = {
  hacer: [
    'Look at that. It is like new. Rıza used to complain the whole time.',
    'Good. I do not have to worry about that job now.',
  ],
  sevim: ['You did it properly. Thank you.', 'That’s been bothering me for a week.'],
  burak: ['You have helped me so much, honestly.', 'I owe you a coffee.'],
  derya: ['Thank you. That is one less thing to do.', 'You didn’t have to do that so well.'],
  tarik: [
    'I used to be able to do that with my own hands. Thank you, son.',
    'Sit and have a tea for five minutes.',
  ],
};
const LATE_LINES: Record<Rid, string[]> = {
  hacer: [
    'You are here at last. I nearly sent someone down for you.',
    'You are late. Rıza would have been late too, but he would have had a story.',
  ],
  sevim: ['It has gone cold. Do not worry.', 'I thought you were not coming.'],
  burak: [
    'That is all right. I managed without it. Thank you anyway.',
    'Ah, I had already managed without it. Thank you.',
  ],
  derya: ['It is all right. Everyone is late today.', 'Thanks. I nearly went myself.'],
  tarik: [
    'I waited. It doesn’t matter. Thank you.',
    'There you are. I thought you had forgotten the old man.',
  ],
};

function complete(s: GameState, t: Task, hook: boolean) {
  if (s.month && t.storyFor && s.minute <= t.by) {
    s.month.helped[t.storyFor] = true;
    say(s, 'narrator', PRIVATE_WORK[t.storyFor].outcome, 'event');
    stamp(s, `private_${t.storyFor}`);
  }
  t.done = s.minute;
  t.hook = hook;
  const late = s.minute > t.by;
  if (t.kind === 'bins') {
    if (!late) say(s, 'narrator', 'The bins were out before the truck.', 'journal');
    else
      say(
        s,
        'narrator',
        'The truck comes at 20:45. It had already gone, so the bins stayed on the pavement all night.',
        'journal',
      );
    for (const r of s.residents) {
      if (s.castPauses?.[r.id] === 'paused') continue;
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
  if (s.castPauses?.[t.for] === 'paused') {
    if (late) report(s).late++;
    else report(s).done++;
    say(
      s,
      'narrator',
      `${nameOf(t.for)}’s chapter is paused. You left the delivery at the door. Nobody answered.`,
      'journal',
    );
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
    say(
      s,
      'narrator',
      `${nameOf(t.for)} had gone out. ${t.for === 'burak' || t.for === 'tarik' ? 'He' : 'She'} will find the work done on coming home.`,
      'journal',
    );
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
    report(s).treats.push('a lemon candy from Mr Tarık');
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

/** Both arrival and the explicit player command use this authored interval and cost. */
function startOrdinaryWork(s: GameState, job: Task) {
  const work = job.work as number;
  s.k.busyTask = job.id;
  s.k.busyUntil = s.minute + work;
  kapiciDoes(s, 'work', work, 0.5);
}

/** Private story work keeps its separate invitation and consent route. */
export function canStartWork(s: GameState, job: Task): boolean {
  return (
    s.version === WORK_START_VERSION &&
    s.phase === 'day' &&
    !s.k.walk &&
    s.k.busyTask === null &&
    s.k.busyUntil <= s.minute &&
    s.tasks.includes(job) &&
    job.done === undefined &&
    job.kind === 'job' &&
    !job.pickup &&
    !job.storyFor &&
    !job.custody &&
    !job.carried &&
    !job.wrongDoor &&
    job.place === s.k.at &&
    job.from <= s.minute &&
    Number.isInteger(job.work) &&
    (job.work as number) > 0 &&
    dayOf(job.from) === today(s)
  );
}

function arrive(s: GameState) {
  const k = s.k;
  pickupAt(s, k.at);
  deliverAt(s, k.at);
  // A job here: start work.
  const job = s.tasks.find(
    (t) => !t.done && t.kind === 'job' && t.place === k.at && t.from <= s.minute && !t.pickup,
  );
  if (job?.work) startOrdinaryWork(s, job);
  else kapiciDoes(s, 'rest', 15, 0.05);
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
    'My scheduled night shift has finished. I am pausing here before the chapter where I work as a temporary replacement. Flat 5 is still my home.',
    'voice',
  );
}

function applyInput(s: GameState, inp: Input) {
  switch (inp.kind) {
    case 'start-work': {
      const job = s.tasks.find((t) => t.id === inp.task);
      if (job && canStartWork(s, job)) startOrdinaryWork(s, job);
      return;
    }
    case 'cast-pause':
      if (inp.who === 'burak' || inp.who === 'tarik') {
        say(
          s,
          inp.who,
          inp.who === 'burak'
            ? 'I still need to keep the building accounts. We have not agreed who would take over the accounts in this chapter.'
            : s.month?.duesPaid
              ? 'I made the agreed payments. I am keeping this chapter’s building records here.'
              : 'I still owe my building payments. Pausing this chapter does not settle them.',
          'voice',
        );
        return;
      }
      s.castPauses ??= {};
      if (!s.castPauses[inp.who]) {
        s.castPauses[inp.who] = 'requested';
        say(
          s,
          inp.who,
          'I will pause after my current activity. I must also finish my work or sleep. Close the menu and continue the day.',
          'voice',
        );
      }
      return;
    case 'one-cast-depart': {
      if (!canReplay(s.version) || s.oneCast?.departure || s.minute > 480) return;
      s.oneCast = { ...s.oneCast, rows: s.oneCast?.rows ?? [], departureRequested: true };
      if (s.minute === 480) pauseDeryaRota(s);
      else
        say(
          s,
          'narrator',
          'Derya will pause her scheduled shifts when this night shift ends at eight. She still needs to sleep in the morning.',
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
          say(
            s,
            'narrator',
            'You are already here. There is nothing to pick up or deliver just now.',
            'journal',
          );
        return;
      }
      const up = floorOf(inp.to) > floorOf(s.k.at);
      s.k.walk = { from: s.k.at, to: inp.to, at0: s.minute, at1: s.minute + mins };
      kapiciDoes(
        s,
        'walk',
        mins,
        up ? 0.85 : raining(s) && (outside(s.k.at) || outside(inp.to)) ? 0.55 : 0.35,
      );
      return;
    }
    case 'news':
    case 'tell':
    case 'invent':
    case 'word':
      if (!canTalk(s, inp.who)) {
        say(s, 'narrator', `${nameOf(inp.who)} is not here. You need to meet face to face.`, 'journal');
        return;
      }
      if (inp.kind === 'news') return askNews(s, inp.who);
      if (inp.kind === 'tell') return tell(s, inp.who, inp.prop, inp.value, inp.sure);
      if (inp.kind === 'invent') return invent(s, inp.who, inp.about, inp.trait);
      return askWord(s, inp.who);
    case 'sit':
      if (!canTalk(s, inp.who)) {
        say(s, 'narrator', `${nameOf(inp.who)} is not here. You need to meet face to face.`, 'journal');
        return;
      }
      return sit(s, inp.who, inp.topic);
    case 'entrust':
      if (s.month) return entrust(s, inp.who, inp.task);
      return;
    case 'repayment':
      if (s.month) arrangeRepayment(s);
      return;
    case 'help-story':
      if (s.month) return helpStory(s, inp.who);
      return;
    case 'seat':
      if (s.month) return inviteSeat(s, inp.who, inp.beside);
      return;
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
    'I listened to children reading aloud for forty years. I still hear them in the evenings.',
    'Hacer heard a correction as a command. Perhaps I could have asked what she meant first.',
    'My child writes from abroad. I answer too formally, then wonder why the conversation feels distant.',
  ],
  burak: [
    'You can tell when an account is complete. In a conversation, you rarely know when you have said enough.',
    'Could you hold this fold a moment? No, let us do it another evening. It is not quite ready.',
    'I like accounting. I also like making something that does not have to be useful.',
  ],
  derya: [
    'People are honest at four in the morning. Everybody says what they mean at four.',
    'I sleep with the pillow over my head. I still hear your bell through it.',
    'People on the step count my visitors. Let them count.',
  ],
  tarik: [
    'In 1974 the ferry froze in the harbour. Did I tell you? We walked to Karaköy on the ice. Nobody believes me.',
    'My family visits when they can. When they cancel a visit, I still notice the time I would have spent with them.',
    'I worked on the ferry route to Kadıköy for forty years. I knew the route without looking. Some mornings I did not look.',
    'You climb those stairs for me every day. You have saved my legs some work. I am grateful.',
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
    say(s, who, 'You asked me already. Nothing has happened since.', 'voice');
    return;
  }
  r.newsDay = today(s);
  tick(p, Math.max(p.now, s.minute));
  tick(s.kapici, Math.max(s.kapici.now, s.minute));
  const aff = relationshipWith(p, KAPICI).affection;
  if (storyNews(s, who)) return;
  if (s.lifeNotes?.[who])
    say(
      s,
      who,
      requiredSimValue(s.lifeNotes[who], 'The resident’s life note disappeared during the greeting.'),
      'voice',
    );
  if (aff < -0.2) {
    say(s, who, 'I have no news for you today.', 'voice');
    return;
  }
  const res = converse(p, s.kapici, {
    at: s.minute,
    traits: TRAITS,
    maxClaims: aff > 0.25 ? 3 : 2,
    ...(s.month ? { provenance: true, confidentMin: RELAY_POLICY[who] } : {}),
  });
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
      'Do you mean the man who comes at night? That’s Volkan, my brother. He lost his job. Do not tell the other residents. They would gossip about it.',
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
        say(s, 'narrator', 'You added a new line to the notebook.', 'event');
      }
  }
}

/** When a resident has nothing about anyone to pass on, they talk about their own life: each in their own words. */
const SMALL_NEWS: Record<Rid, string[]> = {
  hacer: [
    'My knee hurts again. Rain is coming, you’ll see.',
    'The grocer gave me too little change. That has happened twice this month.',
    'Nothing happened. I sat by the window all morning and saw nothing.',
  ],
  sevim: [
    'The notice board is badly written. Somebody spelled “boiler” wrong.',
    'My child rang from abroad but was too busy to talk, as usual.',
    'I heard nothing worth repeating.',
  ],
  burak: [
    'It is the end of the month. I spend all my time at the office.',
    'I have little news. I have been working.',
    'Honestly, I am tired. That is my news.',
    'I am trying to decide something. Please do not ask about it.',
    'My mother rang. Every time she calls, she asks when I will marry.',
    'Do you think people can tell when you are nervous?',
  ],
  derya: [
    'It was a long night. Two patients arrived at four.',
    'I have no news. I slept through it all.',
    'I do not work on Saturday. That is my news.',
  ],
  tarik: [
    'My family may ring on Sunday. I am not sure they will.',
    'In 1974 the ferry froze in the harbour. Did I tell you?',
    'The gulls woke me at five, as they always do.',
  ],
};
const NO_STORIES: Record<Rid, string[]> = {
  hacer: ['I have no news for you today.'],
  sevim: ['I do not repeat gossip.'],
  burak: ['I don’t really do gossip.', 'I do not get involved in gossip.'],
  derya: ['I hear enough gossip at the hospital. I do not want it here.'],
  tarik: ['Let’s not talk about people.', 'At my age you stop repeating gossip.'],
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
    say(s, 'narrator', 'You cannot make up a story about someone while speaking to them.', 'journal');
    return;
  }
  if (!(INVENTABLE as readonly string[]).includes(trait) && !trait.startsWith('sweet:')) {
    say(s, 'narrator', 'You could not find words for that story.', 'journal');
    return;
  }
  const prop = `${about}:${trait}`;
  if (trait.startsWith('sweet:')) {
    const other = trait.slice(6) as Rid;
    if (!RESIDENTS[about].single || !RESIDENTS[other]?.single || other === about) {
      say(
        s,
        'narrator',
        'Nobody would believe that about a married person. You can only choose people who are single.',
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
  perceive(
    p,
    [
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
    ],
    s.month ? { reputationTraits: TRAITS } : undefined,
  );
  if (!s.month) customReputation(p, [{ prop, b: before }], s.minute);
  const after = credence(p, prop);
  r.told.push({ prop, value, at: s.minute, lie });
  s.month?.testimony.push({
    from: KAPICI,
    to: who,
    prop,
    value,
    at: s.minute,
    caretaker: { at: s.minute, lie },
  });
  if (!s.month && r.told.length > 40) r.told.splice(0, r.told.length - 40);
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
  if (already)
    line = pick(s, ['Everybody knows that.', 'That is old news, my child.', 'I know that already.']);
  else if (unfav && aboutPerson && holds) {
    line = pick(s, [
      'I would rather not hear that.',
      'That is a private matter.',
      'Let’s not talk about people.',
    ]);
    socialEvent(p, { at: s.minute, kind: 'conflict', otherId: KAPICI, byMe: false, magnitude: 0.1 });
  } else if (unfav && aboutPerson && feel > 0.35) {
    line = pick(s, [
      `Don’t talk like that about ${nameOf(subject)}.`,
      `Are you talking about ${nameOf(subject)}? No, I do not believe it.`,
    ]);
    socialEvent(p, { at: s.minute, kind: 'insult', otherId: KAPICI, byMe: false, magnitude: 0.2 });
  } else if (moved < 0.03)
    line = pick(s, [
      'Who told you that?',
      'I am not sure about that.',
      'I will believe it when I see it myself.',
    ]);
  else if (unfav && aboutPerson && feel < 0) {
    line = pick(s, [
      'I knew it. Have I not always said that?',
      'Of course that is true.',
      'Ha! Come in for a minute and tell me more.',
    ]);
    pleasure = moved * (0.5 - feel) * 2;
  } else if (!unfav && aboutPerson && feel > 0.2) {
    line = pick(s, ['That’s nice to hear.', 'That is good. I am happy to hear it.']);
    pleasure = moved * feel;
  } else if (prop === FACTS.ring || prop.includes(':sweet:') || prop === FACTS.visitor) {
    line = pick(s, [
      'Is that really true?',
      'Well! I would never have expected that.',
      'Tell me everything.',
    ]);
    pleasure = moved * (0.3 + p.traits.openness);
  } else line = pick(s, ['Is that so?', 'I am thinking about that.', 'That is interesting.']);
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
      say(s, 'narrator', `${nameOf(who)} gave you ${treat.replace(/ from .*/, '')}.`, 'event');
      stamp(s, 'treat');
    }
  }
  if (prop === FACTS.ring && who === 'hacer') s.ring.spoiled = credence(p, FACTS.ring) >= 0.7;
}

const TREAT: Record<Rid, string> = {
  hacer: 'a slice of savoury pastry from Ms Hacer',
  sevim: 'two biscuits from Ms Sevim',
  burak: 'a coffee from Burak',
  derya: 'a bag of oranges from Derya',
  tarik: 'a lemon candy from Mr Tarık',
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
  if (weekday(s) < 4) return 'Ask from Thursday at 07:00, face to face.';
  const p = personOf(s, who);
  const r = predict(p, wordOffers(), wordAsk);
  return r.verdict === 'assented'
    ? `${nameOf(who)} will probably agree.`
    : r.verdict === 'refused'
      ? `${nameOf(who)} will probably refuse.`
      : `${nameOf(who)} might agree.`;
}

function askWord(s: GameState, who: Rid) {
  const r = rOf(s, who);
  if (r.word) {
    say(s, who, r.word === 'yes' ? 'I said I would. Don’t ask twice.' : 'I told you already.', 'voice');
    return;
  }
  if (weekday(s) < 4) {
    say(
      s,
      who,
      pick(s, ['Ask me from Thursday. I hardly know you yet.', 'Ask me from Thursday. We’ll see then.']),
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
      from: dayStart(sunday(s)) + MEETING - 30,
      until: dayStart(sunday(s)) + MEETING + 60,
      importance: 0.04 + 0.2 * Math.max(0, relationshipWith(p, KAPICI).affection),
      normId: 'keep-promise',
    });
    say(
      s,
      who,
      pick(s, [
        'Of course. You’ve been good to us.',
        'All right. I’ll say something.',
        'Yes, I will do that for you.',
      ]),
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
    say(s, 'narrator', 'Nobody is here to take it. You never leave a parcel on a door handle.', 'journal');
    return;
  }
  if (!t || t.done || !t.carried || t.kind !== 'parcel' || t.for === who) {
    say(
      s,
      'narrator',
      'You can only deliver a courier parcel to the wrong door. Residents know when to expect bread and shopping.',
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
  if (s.castPauses?.[t.for] !== 'paused')
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
      say(s, 'riza', 'Derya sleeps until three. Leave her bread on the hook. Never ring the bell.', 'margin');
    } else if (s.knocks === 2) {
      say(s, who, 'Again? Do you know what time I got in?', 'voice');
      say(s, 'narrator', 'Across the landing, Burak’s door opened an inch and closed again.', 'event');
      believeSelf(personOf(s, 'burak'), 'kapici:kind', false, 0.65, s.minute);
    } else {
      say(s, who, 'That’s it. I’m telling Mr Burak.', 'voice');
      for (const o of ['burak', 'hacer'] as const)
        believeSelf(personOf(s, o), 'kapici:kind', false, 0.7, s.minute);
    }
    deliverAt(s, s.k.at);
    // Back to sleep after.
    r.until = s.minute + 6;
  } else if (r.where !== 'home') say(s, 'narrator', 'Nobody answers.', 'journal');
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
    say(s, 'narrator', 'You left the courtyard gate open.', 'journal');
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
          ? 'You have already done that once today.'
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
      if (s.castPauses?.[a] === 'paused') continue;
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
  say(s, 'narrator', 'You added a new line to the notebook.', 'event');
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
  if (!s.month && (today(s) > 6 || (today(s) === 6 && tod(s) > 18 * 60))) return false;
  fund.agreed = true;
  if (s.month)
    s.month.repaymentAt = dayStart(Math.max(12, today(s) + ((5 - weekday(s) + 7) % 7 || 7))) + 10 * 60;
  fund.repairAt = s.month
    ? dayStart(today(s) + 1) + 10 * 60
    : today(s) < 6
      ? dayStart(today(s) + 1) + 10 * 60
      : dayStart(6) + 19 * 60;
  if (s.month) {
    s.month.supplierBalance = 600;
    s.month.invoiceDueAt = s.month.repaymentAt;
    promiseDues(s);
  }
  say(s, who, STORY_LINES.agreement, 'voice');
  return true;
}

function storyEvents(s: GameState) {
  if (!s.stories) return;
  const { feud, fund } = s.stories;
  if (
    s.castPauses?.hacer !== 'paused' &&
    s.castPauses?.sevim !== 'paused' &&
    !feud.reconciled &&
    feud.hacerPassed &&
    feud.sevimPassed &&
    (s.month ? weekday(s) === 6 : today(s) === 6) &&
    tod(s) >= 17 * 60
  ) {
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
  say(s, 'narrator', 'The boiler’s pump has broken. A new one is ₺2,400. Mr Burak looked pale.', 'event');
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
  say(
    s,
    'burak',
    'The fund has too little money. Some flats are behind on their payments. I won’t say who.',
    'voice',
  );
  for (const r of RIDS)
    if (r !== 'burak' && s.castPauses?.[r] !== 'paused')
      believeSelf(personOf(s, r), FACTS.fund, true, 0.6, s.minute);
  // Hacer wonders where the money went.
  const n = personOf(s, 'hacer');
  if (s.castPauses?.hacer !== 'paused')
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
    'Take this down to Burak for me. It is part of my building payments. Don’t say anything to anyone, my child. My pension is late again.',
    'voice',
  );
  stamp(s, 'envelope');
}

function nightEvents(s: GameState, day: number) {
  // Tuesday to Thursday: a man rings flat 5 near midnight. From your window you see him; so does Hacer.
  if (
    s.castPauses?.derya !== 'paused' &&
    day >= 2 &&
    day <= 4 &&
    !(s.oneCast?.departure && !s.oneCast.admission)
  ) {
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
      3: 'The same man came to flat 5 late again. He carried a bag this time. The curtain on the landing moved.',
      4: 'The man came to flat 5 again after eleven. You heard him laugh on the landing, and Derya say “shh”.',
    };
    say(s, 'narrator', lines[day] ?? '', 'event');
    const n = personOf(s, 'hacer');
    if (s.castPauses?.hacer !== 'paused')
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
  s.minute = dayStart(sunday(s)) + MEETING;
  if (s.month) {
    finishMonthVisits(s);
    meetingSeats(s);
    const bookAt = s.minute + 10;
    for (; s.minute < bookAt; s.minute++) {
      for (const r of s.residents) residentMinute(s, r);
      monthCaretakerQuiet(s);
      finishMonthVisits(s);
    }
  }
  if (s.month) tick(s.kapici, Math.max(s.kapici.now, s.minute));
  say(
    s,
    'narrator',
    'It is Sunday. The residents meet in Mr Burak’s flat. He serves tea in the good glasses.',
    'journal',
  );
  for (const id of RIDS) {
    if (s.castPauses?.[id] === 'paused') {
      rOf(s, id).vote = 'away';
      continue;
    }
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
      ? 'Here is the pump invoice and the deposit. The balance is due next week. We are arranging the repayments privately.'
      : 'Here is the book. Every hundredth of a lira is recorded. One flat is behind, and that is their business.',
    'voice',
  );
  const duesOut = RIDS.filter(
    (id) => id !== 'burak' && id !== 'tarik' && credence(personOf(s, id), FACTS.dues) >= 0.7,
  );
  if (duesOut.length >= 2) {
    say(s, 'narrator', 'Everyone looked at Mr Tarık. He looked at his tea.', 'event');
    const t = personOf(s, 'tarik');
    socialEvent(t, { at: s.minute, kind: 'harm', otherId: KAPICI, byMe: false, magnitude: 0.4 });
  }
  // The vote on the kapıcı's tea money: each resident's own decision.
  let yes = 0;
  let no = 0;
  for (const id of RIDS) {
    if (s.castPauses?.[id] === 'paused') {
      rOf(s, id).vote = 'away';
      continue;
    }
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
        label:
          s.month && today(s) === 28
            ? 'keep the caretaker for another month'
            : 'raise the kapıcı’s tea money',
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
  const approved = yes >= 4;
  const final = !!s.month && today(s) === 28;
  const raise = approved && !final;
  s.meeting = { done: true, yes, no, raise };
  if (s.month) {
    s.month.meetings.push({ day: today(s), ...s.meeting });
    if (today(s) === 28) {
      s.month.stay = approved;
      say(
        s,
        'narrator',
        approved
          ? 'The residents vote to keep you as caretaker. Burak writes the renewed agreement in the book.'
          : 'The residents do not renew your caretaker agreement. You keep your notebook and the money you earned.',
        'event',
      );
    }
  }
  if (raise) {
    s.k.money += 300;
    stamp(s, 'raise');
  }
  if (!final)
    say(
      s,
      'narrator',
      raise
        ? `Your tea money increases after ${yes} votes in favour. Mr Burak counts ₺300 into your tin.`
        : `Your tea money stays the same. Votes in favour: ${yes}. Votes against: ${no}.`,
      'event',
    );
}

// ---------- the day ----------

function turnPage(s: GameState) {
  if (s.phase === 'night') {
    const next = today(s) + 1;
    if (s.month ? next % 7 === 0 : next === 7) {
      if (s.month) monthBeforeMeeting(s, next);
      s.phase = 'sunday';
      meeting(s);
      return;
    }
    if (s.month) monthNightBodies(s, next);
    s.minute = dayStart(next) + DAY_START;
    s.phase = 'day';
    morning(s, next);
    return;
  }
  if (s.phase === 'sunday') {
    if (s.month && today(s) < 28) {
      // Sunday is not a thirty-four-hour fast. Resolve the off-duty afternoon on
      // the same minute clock; meals and sleep remain actual HF activities.
      const sundayDay = today(s);
      s.k.at = 'room';
      s.k.walk = null;
      s.k.busyTask = null;
      for (; s.minute < dayStart(sundayDay) + DAY_END; s.minute++) {
        for (const r of s.residents) residentMinute(s, r);
        monthCaretakerQuiet(s);
        finishMonthVisits(s);
      }
      const nextDay = today(s) + 1;
      monthNightBodies(s, nextDay);
      s.minute = dayStart(nextDay) + DAY_START;
      s.phase = 'day';
      for (const r of s.residents) {
        r.word = null;
        delete r.vote;
      }
      s.month.seats = {};
      morning(s, today(s));
    } else s.phase = 'end';
  }
}

function morning(s: GameState, day: number) {
  for (const r of s.residents) {
    if (s.castPauses?.[r.id] === 'paused') continue;
    const info = RESIDENTS[r.id];
    r.where = s.month
      ? personOf(s, r.id).activity?.action === 'work'
        ? 'work'
        : 'home'
      : info.nights && day <= 6
        ? 'work'
        : 'home';
    r.until = s.minute + 15 + ((RIDS.indexOf(r.id) * 11 + day * 5) % 40);
    if (info.nights && day > 1 && (s.month ? personOf(s, r.id).activity?.action === 'work' : day <= 6))
      r.until = s.minute + 60;
    r.stairsUntil = 0;
  }
  s.k.at = 'room';
  s.k.walk = null;
  s.k.busyTask = null;
  // Edition11 resolved this night before moving the world clock.
  // Edition9 keeps its exact existing sleep path.
  if (!s.month)
    for (const p of [...s.people, s.kapici]) {
      if (s.castPauses?.[p.id as Rid] === 'paused') continue;
      if (canReplay(s.version) && p.id === 'derya') {
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
    2: 'It is Tuesday. A courier is due before noon.',
    3: 'It is Wednesday. The radiators are cold this morning.',
    4: 'It is Thursday. Somebody has been talking on the step about flat 5.',
    5: 'It is Friday. Mr Tarık walks slowly downstairs for Friday prayer at 12:30.',
    6: 'It is Saturday. Burak is home all day and has ironed a shirt.',
  };
  say(
    s,
    'narrator',
    lines[day] ??
      (s.month
        ? `${dayLabel(s)}. The bakery opens at seven. The building still needs its daily work.`
        : (DAY_NAMES[day - 1] ?? '')),
    'journal',
  );
  if (s.month && day === 8)
    say(
      s,
      'riza',
      'Rain is forecast for Tuesday afternoon. The shop awning keeps the front step dry. Leave time for wet streets.',
      'margin',
    );
  if (s.month && day === 15)
    say(
      s,
      'riza',
      'If someone trusted you with unfinished private work, ask whether they would like a hand. They may say no.',
      'margin',
    );
  if (day === 3)
    say(s, 'riza', 'If the boiler breaks, look at the pump first. Then look at Burak’s face.', 'margin');
  if (day === 4 && s.castPauses?.hacer !== 'paused')
    say(s, 'riza', 'What Hacer sees at night, people on the step hear about by noon.', 'margin');
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
      say(s, 'narrator', 'Nobody took the bins down. The landing smelled of rubbish all night.', 'journal');
      for (const r of s.residents.filter((r) => s.castPauses?.[r.id] !== 'paused'))
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
      if (s.castPauses?.[t.for] === 'paused') {
        t.done = s.minute;
        say(
          s,
          'narrator',
          `You had not finished ${nameOf(t.for)}’s request when ${nameOf(t.for)} left this chapter.`,
          'journal',
        );
        continue;
      }
      rep.missed++;
      if (s.month && t.custody) {
        t.custodyMissed = true;
        say(
          s,
          'narrator',
          `${nameOf(t.for)}’s parcel is still sealed at ${nameOf(t.custody)}’s flat. It missed today’s deadline and must still be handed over.`,
          'journal',
        );
        socialEvent(personOf(s, t.for), {
          at: s.minute,
          kind: 'harm',
          otherId: KAPICI,
          byMe: false,
          magnitude: 0.15,
        });
        continue;
      }
      const p = personOf(s, t.for);
      socialEvent(p, { at: s.minute, kind: 'harm', otherId: KAPICI, byMe: false, magnitude: 0.15 });
      believeSelf(p, 'kapici:reliable', false, 0.65, s.minute);
      t.done = s.minute;
      say(
        s,
        'narrator',
        `${unfinishedTask(t)} ${t.carried ? `You left the delivery by ${nameOf(t.for)}’s door for the morning.` : `${t.for === 'burak' || t.for === 'tarik' ? 'He' : 'She'} probably dealt with it without your help.`} ${t.for === 'burak' || t.for === 'tarik' ? 'He' : 'She'} noticed.`,
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
        ? s.castPauses?.hacer === 'paused'
          ? 'The ginger stray explored the entrance. Sevim sneezed at it.'
          : 'The ginger stray came in through the gate. Hacer fed it. Sevim sneezed at it.'
        : 'The ginger cat came back. Burak has started calling it Pamuk.',
      'event',
    );
    if (s.castPauses?.sevim !== 'paused')
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
    if (s.castPauses?.hacer !== 'paused')
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
    if (s.castPauses?.[r.id] === 'paused') continue;
    if (r.word !== 'yes') continue;
    if (credence(personOf(s, r.id), 'kapici:dishonest') < 0.65) continue;
    r.word = 'no';
    const why = r.caught.length
      ? `${nameOf(r.id)} caught you telling different stories.`
      : r.grudges.some((g) => g.lie)
        ? `Your comments about ${nameOf(r.id)} got back to ${r.id === 'burak' || r.id === 'tarik' ? 'him' : 'her'}.`
        : 'People on the step say you are dishonest.';
    say(
      s,
      'narrator',
      `${nameOf(r.id)} avoided looking at you on the stairs. ${why} You can no longer count on ${r.id === 'burak' || r.id === 'tarik' ? 'his' : 'her'} vote on Sunday.`,
      'event',
    );
  }
  if ((s.month ? weekday(s) : day) === 6) {
    const likely = s.residents.filter((r) => handsLean(s, r.id) === 'likely').map((r) => nameOf(r.id));
    const maybe = s.residents.filter((r) => handsLean(s, r.id) === 'maybe').map((r) => nameOf(r.id));
    say(
      s,
      'riza',
      `Think about the vote before you sleep. ${likely.length ? `${likely.join(', ')} will probably vote for your raise.` : 'There is nobody you can be sure of.'} ${maybe.length ? `${maybe.join(', ')} may vote for your raise. ` : ''}Four votes will raise the tea money.`,
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
  if (s.month) monthEvents(s);
  if (t >= DAY_END) endDay(s);
}

function waterOff(s: GameState) {
  // The water notice on the board came true: anyone the kapıcı told sees his word was good.
  for (const r of s.residents) {
    if (s.castPauses?.[r.id] === 'paused') continue;
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
  validateInputContract(s.version, inp);
  s.inputs.push({ ...inp, at: s.minute } as Input);
  applyPending(s);
}

export function replay(
  seed: number,
  inputs: readonly Input[],
  until?: number,
  edition = GAME_VERSION,
  admission?: DeryaReturnAdmission,
  chapter?: CastChapter,
): GameState {
  if (!canReplay(edition))
    throw new Error(`This notebook belongs to an older edition. Start fresh. (${edition})`);
  if (edition === WORK_START_VERSION && (admission || chapter))
    throw new Error(
      'Character transfer is not available for this work option. Download a copy of your game.',
    );
  for (const input of inputs) validateInputContract(edition, input);
  let s = newGame(seed, edition, chapter);
  let suffix = inputs;
  if (admission) {
    const prefix = admission.prefix;
    if (
      seed !== prefix.seed ||
      edition !== prefix.edition ||
      JSON.stringify(inputs.slice(0, prefix.inputs.length)) !== JSON.stringify(prefix.inputs) ||
      (until !== undefined && until < prefix.minute)
    )
      throw new Error('This return does not match the saved departure. Keep your file and start a new game.');
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

export const canReplay = (game: string | undefined): boolean =>
  game === GAME_VERSION || game === MONTH_VERSION || game === WORK_START_VERSION;

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
  const name = nameOf(id);
  const subject = id === 'burak' || id === 'tarik' ? 'he' : 'she';
  const start = subject === 'he' ? 'He' : 'She';
  const warmth =
    a > 0.35
      ? `${name} is fond of you.`
      : a > 0.12
        ? `${name} seems friendly.`
        : a > -0.08
          ? `${name} is polite to you.`
          : a > -0.25
            ? `${name} seems distant.`
            : `${name} seems unfriendly.`;
  const word =
    lie >= 0.65
      ? `${start} thinks you lie.`
      : lie >= 0.55 && w >= 0.45
        ? `${start} is not sure ${subject} can trust you.`
        : w >= 0.72
          ? `${start} believes what you say.`
          : w >= 0.58
            ? `${start} listens to you.`
            : w >= 0.45
              ? `${start} is not sure ${subject} can trust you.`
              : `${start} doubts what you say.`;
  return { warmth, word };
}

export function openTasks(s: GameState): Task[] {
  return s.tasks.filter((t) => !t.done && t.from <= s.minute);
}

export { INVENTABLE };

/** Bounded month scenes. No guessed consent: each invitation uses an HF decision.
 * Private work becomes an ordinary timed errand only after the resident assents.
 */
function assent(
  s: GameState,
  who: Rid,
  id: string,
  label: string,
  minutes: number,
  target = KAPICI,
): boolean {
  const p = personOf(s, who);
  tick(p, Math.max(p.now, s.minute));
  const accept = offer(id, {
    action: 'help',
    label,
    targetId: target,
    duration: minutes,
    tags: ['help'],
    advertises: { belonging: 0.12 },
  });
  const refuse = offer('decline', {
    action: 'wait',
    label: 'keep my own plans',
    duration: 2,
    advertises: { autonomy: 0.1 },
  });
  const rec = decide(p, [accept, refuse], {
    now: s.minute,
    suggestion: { voiceId: KAPICI, affordanceId: id, strength: 0.5 },
  });
  return rec.chosenAffordanceId === id;
}
function entrust(s: GameState, who: Rid, id: number) {
  const t = s.tasks.find((x) => x.id === id);
  if (!t || t.done || !t.carried || t.kind !== 'parcel' || t.for === who || !canTalk(s, who)) return;
  if (s.castPauses?.[t.for] === 'paused') return;
  kapiciDoes(s, 'arrange-parcel', 5, 0.1);
  s.k.walk = { from: s.k.at, to: s.k.at, at0: s.minute, at1: s.minute + 5 };
  if (
    !assent(
      s,
      who,
      'keep_parcel',
      `keep ${nameOf(t.for)}’s parcel sealed until they can collect it`,
      5,
      t.for,
    )
  ) {
    say(s, who, 'I cannot take responsibility for that today. Keep it with you.', 'voice');
    return;
  }
  t.carried = false;
  t.custody = who;
  t.custodyAt = s.minute;
  promise(personOf(s, who), {
    kind: 'promise',
    toId: t.for,
    label: 'hand over the sealed parcel',
    actions: ['handover-parcel'],
    targetId: t.for,
    from: s.minute,
    until: t.by,
    importance: 0.3,
    normId: 'keep-promise',
  });
  say(
    s,
    who,
    `Tell ${nameOf(t.for)} it is safe with me. I will hand it over when we are both home. If we miss each other, it will still be waiting.`,
    'voice',
  );
}
function helpStory(s: GameState, who: Rid) {
  const month = requiredSimValue(s.month, 'The private work request has no month.');
  if (
    s.k.at !== `door:${who}` ||
    s.k.walk ||
    s.k.busyTask !== null ||
    !canTalk(s, who) ||
    today(s) < 15 ||
    s.secrets[PRIVATE_FACTS[who]] === undefined ||
    !trustedStoryListener(s, who)
  )
    return;
  if (tod(s) + PRIVATE_WORK[who].minutes > 19 * 60) {
    say(s, who, 'We need time before seven. Ask me tomorrow at home.', 'voice');
    return;
  }
  if (month.helped[who] || s.tasks.some((t) => t.storyFor === who && !t.done)) return;
  const work = PRIVATE_WORK[who];
  if (!assent(s, who, 'private_help', work.label, work.minutes)) {
    kapiciDoes(s, 'ask-private-help', 2, 0.05);
    s.k.walk = { from: s.k.at, to: s.k.at, at0: s.minute, at1: s.minute + 2 };
    say(s, who, 'I would rather leave that alone today.', 'voice');
    return;
  }
  const task = addTask(s, {
    kind: 'job',
    for: who,
    place: `door:${who}`,
    label: work.label,
    work: work.minutes,
    from: s.minute,
    by: dayStart(today(s)) + 19 * 60,
    storyFor: who,
  });
  s.k.busyTask = task.id;
  s.k.busyUntil = s.minute + work.minutes;
  rOf(s, who).until = Math.max(rOf(s, who).until, s.k.busyUntil);
  kapiciDoes(s, 'work', work.minutes, 0.3);
  say(s, who, 'Yes. We can do that here before seven. It stays between us.', 'voice');
}
function inviteSeat(s: GameState, who: Rid, beside: Rid) {
  if (who === beside || !canTalk(s, who) || s.castPauses?.[beside] === 'paused' || weekday(s) > 6) return;
  kapiciDoes(s, 'ask-seating', 2, 0.05);
  s.k.walk = { from: s.k.at, to: s.k.at, at0: s.minute, at1: s.minute + 2 };
  if (!assent(s, who, 'sit_beside', `sit beside ${nameOf(beside)} at Sunday’s meeting`, 10, beside)) {
    say(s, who, `I would rather choose my own chair. Please do not move it for me.`, 'voice');
    return;
  }
  requiredSimValue(s.month, 'The accepted seating invitation has no month.').seats[who] = beside;
  say(s, who, `I can sit beside ${nameOf(beside)}. Ask them too. I will not speak for them.`, 'voice');
}
function meetingSeats(s: GameState) {
  const used = new Set<Rid>();
  for (const [who, beside] of Object.entries(
    requiredSimValue(s.month, 'The meeting seating has no month.').seats,
  ) as [Rid, Rid][]) {
    if (
      used.has(who) ||
      used.has(beside) ||
      requiredSimValue(s.month, 'The reciprocal seating check has no month.').seats[beside] !== who
    )
      continue;
    if (s.castPauses?.[who] === 'paused' || s.castPauses?.[beside] === 'paused') continue;
    if ([who, beside].includes('derya') && s.oneCast?.departure && !s.oneCast.admission) continue;
    used.add(who);
    used.add(beside);
    say(
      s,
      'narrator',
      `${nameOf(who)} and ${nameOf(beside)} chose neighbouring chairs. They spent ten minutes talking before Burak opened the book. Their votes are still their own.`,
      'event',
    );
    // Both accepted this particular company. A quiet conversation is not reconciliation.
    for (const [a, b] of [
      [who, beside],
      [beside, who],
    ] as const)
      socialEvent(personOf(s, a), { at: s.minute, kind: 'chat', otherId: b, byMe: false, magnitude: 0.2 });
  }
}
function monthEvents(s: GameState) {
  const month = requiredSimValue(s.month, 'The month events have no month.');
  if (raining(s) && !month.rain.started) {
    month.rain.started = true;
    say(
      s,
      'narrator',
      'Heavy rain drums on the shop awning above the front step. The street is slow to cross. People can wait under it or go home; the errands still need doing.',
      'event',
    );
  }
  if (today(s) === 9 && tod(s) >= 1000 && !month.rain.ended) {
    month.rain.ended = true;
    say(s, 'narrator', 'The rain eases. Water runs from the awning. The street is passable again.', 'event');
  }
  finishMonthVisits(s);
  if (!month.pensionReceived && s.minute >= dayStart(12) + 9 * 60) {
    month.pensionReceived = true;
    month.tarikCash += 600;
    if (canTalk(s, 'tarik'))
      say(
        s,
        'tarik',
        'My pension has arrived. I put ₺600 aside for the agreed building payments. I will take each weekly payment to Burak privately.',
        'voice',
      );
  }
  if (
    month.invoiceDueAt !== undefined &&
    s.minute > month.invoiceDueAt + 9 * 60 &&
    month.supplierBalance > 0 &&
    !month.supplierLate
  ) {
    month.supplierLate = true;
    say(
      s,
      'narrator',
      'The supplier’s remaining invoice is overdue. Burak kept the unpaid balance open in the building account. The first instalment did not settle it.',
      'event',
    );
  }
  if (
    month.repaymentAt !== undefined &&
    s.minute > month.repaymentAt + 9 * 60 &&
    month.duesBalance > 0 &&
    month.missedPaymentAt !== month.repaymentAt
  ) {
    month.missedPaymentAt = month.repaymentAt;
    say(
      s,
      'narrator',
      'Burak left the repayment line open in the private book. The agreed date passed without a payment. The supplier is still waiting for the outstanding balance.',
      'event',
    );
  }
}
/** HF penalties require actual retained opposite source accounts; the full host ledger remains intact. */
function comparisonNew(
  s: GameState,
  a: Rid,
  b: Rid,
  receipts: { from: Rid; to: Rid; prop: string; value: boolean }[],
): boolean {
  let applied = false;
  for (const receipt of receipts) {
    if (!((receipt.from === a && receipt.to === b) || (receipt.from === b && receipt.to === a))) continue;
    const listener = personOf(s, receipt.to);
    applied =
      contradicted(listener, { sourceId: KAPICI, prop: receipt.prop, value: receipt.value, at: s.minute })
        .applied || applied;
  }
  return applied;
}
/** Preview uses actual travel cost, including loaded legs; the truck never waits. */
export function binsWarning(s: GameState, to: Place): string {
  const bins = openTasks(s).find((t) => t.kind === 'bins');
  if (!bins) return '';
  const pickup = requiredSimValue(bins.pickup, 'The bins task has no pickup place.');
  const arrival =
    s.minute +
    travelMinutes(s, s.k.at, to) +
    (bins.carried
      ? to === 'step'
        ? 0
        : travelMinutes(s, to, 'step')
      : (to === pickup ? 0 : travelMinutes(s, to, pickup)) + travelMinutes(s, pickup, 'step'));
  return arrival > bins.by
    ? 'The truck leaves at 20:45. This route will reach the street after it leaves.'
    : 'The truck leaves at 20:45. Take the bins to the street before then.';
}

/** Edition11 boundaries resolve actual HF meals/sleep. No resource or health reset. */
function monthNightBodies(s: GameState, day: number) {
  const dawn = dayStart(day) + DAY_START;
  for (const p of [...s.people, s.kapici]) {
    if (
      s.castPauses?.[p.id as Rid] === 'paused' ||
      (p.id === 'derya' && s.oneCast?.departure && !s.oneCast.admission)
    )
      continue;
    tick(p, Math.max(p.now, s.minute));
    if (p.activity && (p.activity.action === 'work' || p.activity.action === 'sleep')) {
      tick(p, Math.max(p.now, Math.min(dawn, p.activity.endsAt)));
      if (p.now < p.activity.endsAt) continue; // A carried duty is not cancelled to attend.
    }
    if (p.activity)
      finish(p, {
        affordanceId: p.activity.affordanceId,
        action: p.activity.action,
        status: p.activity.endsAt <= p.now ? 'completed' : 'interrupted',
        at: p.now,
      });
    hostMeal(p, p.now);
    if (p.now < dawn - 30) {
      const sleep = offer('month-night-sleep', {
        action: 'sleep',
        mode: 'sleep',
        label: 'sleep before Sunday',
        duration: dawn - 30 - p.now,
        advertises: { sleep: 0.8, rest: 0.5 },
      });
      const rec = decide(p, [sleep], { now: p.now });
      if (rec.chosenAffordanceId === sleep.id && begin(p, sleep, rec)) {
        tick(p, dawn - 30);
        finish(p, { affordanceId: sleep.id, action: 'sleep', status: 'completed', at: p.now });
      }
    }
    hostMeal(p, Math.max(p.now, dawn - 30));
    tick(p, Math.max(p.now, dawn));
  }
}
function monthBeforeMeeting(s: GameState, day: number) {
  monthNightBodies(s, day);
  const dawn = dayStart(day) + DAY_START;
  s.minute = dawn;
  s.k.at = 'room';
  s.k.walk = null;
  s.k.busyTask = null;
  for (const r of s.residents) {
    if (
      s.castPauses?.[r.id] === 'paused' ||
      (r.id === 'derya' && s.oneCast?.departure && !s.oneCast.admission)
    )
      continue;
    const activity = personOf(s, r.id).activity;
    r.where = activity?.action === 'work' ? 'work' : 'home';
    r.until = activity?.endsAt ?? s.minute;
    r.stairsUntil = 0;
  }
  for (; s.minute < dayStart(day) + MEETING; s.minute++) {
    for (const r of s.residents) residentMinute(s, r);
    monthCaretakerQuiet(s);
    finishMonthVisits(s);
  }
  // Advance every body to the actual seating/vote boundary, including the caretaker.
  for (const p of [...s.people, s.kapici])
    if (
      s.castPauses?.[p.id as Rid] !== 'paused' &&
      !(p.id === 'derya' && s.oneCast?.departure && !s.oneCast.admission)
    )
      tick(p, Math.max(p.now, s.minute));
}
function monthCaretakerQuiet(s: GameState) {
  const p = s.kapici;
  tick(p, Math.max(p.now, s.minute));
  const mealTime = tod(s) === 12 * 60 || tod(s) === 18 * 60;
  if (p.activity && (p.activity.endsAt <= s.minute || mealTime)) {
    const activity = p.activity;
    finish(p, {
      affordanceId: activity.affordanceId,
      action: activity.action,
      status: activity.endsAt <= s.minute ? 'completed' : 'interrupted',
      at: p.now,
      ...(activity.action === 'eat' ? { needs: { food: 0.6, water: 0.6 } } : {}),
    });
  }
  if (!p.activity) {
    const aff = mealTime
      ? offer('month-sunday-meal', {
          action: 'eat',
          label: 'eat at home on Sunday',
          duration: 20,
          advertises: { food: 0.6, water: 0.5 },
        })
      : offer('month-sunday-rest', {
          action: 'rest',
          label: 'rest at home on Sunday',
          duration: 30,
          advertises: { rest: 0.3 },
        });
    const rec = decide(p, [aff], { now: p.now });
    if (rec.chosenAffordanceId === aff.id) begin(p, aff, rec);
  }
}
/** Only a free home interval can hold an authored handover. Meals, sleep, work and calendar duties win. */
function monthVisitFits(s: GameState, id: Rid, minutes: number): boolean {
  const r = rOf(s, id),
    p = personOf(s, id);
  if (
    !p.body.alive ||
    s.castPauses?.[id] ||
    r.where !== 'home' ||
    (p.activity && p.activity.action !== 'rest')
  )
    return false;
  const t = tod(s),
    info = RESIDENTS[id];
  if (t + minutes >= DAY_END || t < 9 * 60) return false;
  if (info.work && weekday(s) <= 5 && t < info.work[1] && t + minutes >= info.work[0]) return false;
  if (info.nights && (t < 15 * 60 + 30 || (weekday(s) <= 5 && t + minutes >= 19 * 60 + 30))) return false;
  return !p.agenda.commitments.some(
    (c) =>
      c.status === 'pending' &&
      c.from <= s.minute + minutes &&
      c.until > s.minute &&
      c.kind !== 'abstain' &&
      !c.actions.every((a) => a === 'rest' || a === 'handover-parcel' || a === 'pay-dues'),
  );
}
function monthVisitOffers(s: GameState, r: RState): Affordance[] {
  const month = requiredSimValue(s.month, 'The resident visit offers have no month.');
  if (month.visits.some((v) => v.done === undefined && (v.actor === r.id || v.other === r.id))) return [];
  const result: Affordance[] = [];
  for (const t of s.tasks) {
    if (t.done || t.custody !== r.id) continue;
    const minutes = Math.max(1, Math.abs(RESIDENTS[r.id].floor - RESIDENTS[t.for].floor) * 3) + 3;
    if (monthVisitFits(s, r.id, minutes) && monthVisitFits(s, t.for, minutes))
      result.push(
        offer(`parcel-handover:${t.id}`, {
          action: 'handover-parcel',
          label: `take the sealed parcel to ${nameOf(t.for)}`,
          targetId: t.for,
          with: [t.for],
          duration: minutes,
          effort: 0.35,
          tags: ['help'],
          advertises: { belonging: 0.15 },
        }),
      );
  }
  if (
    r.id === 'tarik' &&
    month.repaymentAt !== undefined &&
    s.minute >= month.repaymentAt &&
    month.duesBalance > 0 &&
    month.tarikCash >= Math.min(200, month.duesBalance)
  ) {
    const minutes = Math.max(1, Math.abs(RESIDENTS.tarik.floor - RESIDENTS.burak.floor) * 3) + 3;
    if (monthVisitFits(s, r.id, minutes) && monthVisitFits(s, 'burak', minutes))
      result.push(
        offer('dues-payment', {
          action: 'pay-dues',
          label: 'take the agreed weekly payment to Burak privately',
          targetId: 'burak',
          with: ['burak'],
          duration: minutes,
          effort: 0.35,
          tags: ['help'],
          advertises: { autonomy: 0.18, belonging: 0.18 },
          material: -0.1,
        }),
      );
  }
  return result;
}
function startMonthVisit(s: GameState, r: RState, aff: Affordance, rec: DecisionRecord) {
  const month = requiredSimValue(s.month, 'The resident visit departure has no month.'),
    parcel = aff.id.startsWith('parcel-handover:')
      ? s.tasks.find((t) => t.id === Number(aff.id.split(':')[1]))
      : undefined;
  const other = parcel?.for ?? 'burak';
  if ((aff.id !== 'dues-payment' && !parcel) || !monthVisitFits(s, other, aff.duration)) return;
  const receiver = personOf(s, other);
  tick(receiver, Math.max(receiver.now, s.minute));
  const receive = offer('receive-building-handover', {
    action: 'help',
    label: 'wait at home for the agreed handover',
    targetId: r.id,
    with: [r.id],
    duration: aff.duration,
    tags: ['help'],
    advertises: { belonging: 0.1 },
  });
  const decline = offer('keep-plans', {
    action: 'rest',
    label: 'keep my plans',
    duration: 10,
    advertises: { autonomy: 0.1 },
  });
  const consent = decide(receiver, [receive, decline], { now: s.minute });
  if (consent.chosenAffordanceId !== receive.id) {
    const wait = offer('handover-declined', {
      action: 'rest',
      label: 'leave the handover for later',
      duration: 5,
      advertises: { rest: 0.1 },
    });
    const actor = personOf(s, r.id),
      decision = decide(actor, [wait], { now: s.minute });
    if (decision.chosenAffordanceId === wait.id) begin(actor, wait, decision);
    r.until = s.minute + 5;
    return;
  }
  if (receiver.activity)
    finish(receiver, {
      affordanceId: receiver.activity.affordanceId,
      action: receiver.activity.action,
      status: 'interrupted',
      at: Math.max(receiver.now, s.minute),
    });
  const actor = personOf(s, r.id);
  if (actor.activity)
    finish(actor, {
      affordanceId: actor.activity.affordanceId,
      action: actor.activity.action,
      status: 'interrupted',
      at: Math.max(actor.now, s.minute),
    });
  if (!begin(actor, aff, rec) || !begin(receiver, receive, consent)) return;
  month.visits.push({
    actor: r.id,
    other,
    kind: parcel ? 'parcel' : 'dues',
    ...(parcel ? { task: parcel.id } : { amount: Math.min(200, month.duesBalance) }),
    startedAt: s.minute,
    arrivesAt: s.minute + aff.duration - 3,
    finishesAt: s.minute + aff.duration,
  });
  moveTo(s, r, `visit:${other}`, aff.id, aff.duration);
  r.stairsUntil = s.minute + aff.duration - 3;
  rOf(s, other).until = s.minute + aff.duration;
  say(s, 'narrator', `${nameOf(r.id)} set off for ${nameOf(other)}’s flat for an agreed handover.`, 'event');
}
/** New handovers offer no personal material reward. The fixed ₺200 dues instalment
 * uses -0.1 host material utility only after its real conserved transfer succeeds.
 * These are this building's authored amounts, not a general currency conversion.
 */
function finishMonthVisits(s: GameState) {
  const month = requiredSimValue(s.month, 'The resident visit completion has no month.');
  for (const visit of month.visits) {
    if (visit.done !== undefined || s.minute < visit.finishesAt) continue;
    const actor = personOf(s, visit.actor),
      receiver = personOf(s, visit.other);
    tick(actor, Math.max(actor.now, s.minute));
    tick(receiver, Math.max(receiver.now, s.minute));
    const parcel = visit.kind === 'parcel' ? s.tasks.find((t) => t.id === visit.task) : undefined;
    const amount = visit.kind === 'dues' ? (visit.amount ?? 0) : 0;
    if (
      !actor.body.alive ||
      !receiver.body.alive ||
      rOf(s, visit.other).where !== 'home' ||
      (visit.kind === 'parcel' && (!parcel || parcel.done || parcel.custody !== visit.actor)) ||
      (visit.kind === 'dues' && (amount <= 0 || month.tarikCash < amount))
    ) {
      resolveMonthVisit(s, visit, 'interrupted', 0);
      continue;
    }
    if (visit.kind === 'parcel' && parcel) {
      say(
        s,
        'narrator',
        `${nameOf(visit.actor)} arrived and handed the sealed parcel to ${nameOf(visit.other)}. ${s.minute > parcel.by ? 'It arrived late.' : 'It arrived before the deadline.'}`,
        'event',
      );
      complete(s, parcel, false);
      delete parcel.custody;
      stamp(s, 'safe_parcel');
    } else {
      // Debit and retain the transfer before reporting an HF completed outcome or material cost.
      month.tarikCash -= amount;
      month.duesBalance -= amount;
      month.fundCash += amount;
      let supplierPaid = 0;
      if (month.fundCash >= month.supplierBalance) {
        supplierPaid = month.supplierBalance;
        month.fundCash -= supplierPaid;
        month.supplierBalance = 0;
      }
      month.paymentLedger.push({ at: s.minute, amount, supplierPaid, remaining: month.duesBalance });
      month.duesPaid = month.duesBalance === 0;
      month.repaymentAt =
        dayStart(
          dayOf(requiredSimValue(month.repaymentAt, 'The completed dues visit has no repayment date.')) + 7,
        ) +
        10 * 60;
      if (month.duesBalance > 0) promiseDues(s);
      say(
        s,
        'narrator',
        `Tarık arrived at Burak’s table. They recorded a ₺${amount} payment privately.${supplierPaid ? ` Burak transferred ₺${supplierPaid} to the pump supplier and kept the receipt.` : ''} ${month.duesPaid ? 'The agreed dues and the pump balance are paid.' : 'The next weekly payment is still due. The supplier is waiting for the remaining balance.'}`,
        'event',
      );
      if (month.duesPaid) {
        stamp(s, 'kept_dates');
        confirm(actor, FACTS.dues, false, s.minute);
        confirm(receiver, FACTS.dues, false, s.minute);
      }
    }
    resolveMonthVisit(s, visit, 'completed', visit.kind === 'dues' ? -0.1 : 0);
  }
}
function resolveMonthVisit(
  s: GameState,
  visit: MonthVisit,
  status: 'completed' | 'interrupted',
  actorMaterial: number,
) {
  for (const id of [visit.actor, visit.other]) {
    const p = personOf(s, id);
    if (p.activity)
      finish(p, {
        affordanceId: p.activity.affordanceId,
        action: p.activity.action,
        status,
        at: p.now,
        material: id === visit.actor ? actorMaterial : 0,
      });
    rOf(s, id).until = s.minute + 1;
  }
  visit.done = s.minute;
  visit.outcome = status;
}

function promiseDues(s: GameState) {
  const month = s.month;
  if (!month || month.repaymentAt === undefined || month.duesBalance <= 0) return;
  promise(personOf(s, 'tarik'), {
    kind: 'promise',
    toId: 'burak',
    label: 'make the agreed weekly building payment privately',
    actions: ['pay-dues'],
    targetId: 'burak',
    from: month.repaymentAt,
    until: dayStart(dayOf(month.repaymentAt)) + DAY_END,
    importance: 0.35,
    normId: 'keep-promise',
  });
}

/** The caretaker can arrange this one authored encounter, never a general payment plan. */
function arrangeRepayment(s: GameState) {
  if (!s.month || !s.stories?.fund.agreed || !canTalk(s, 'tarik') || s.k.walk || s.k.busyTask !== null)
    return;
  const offer_ = monthVisitOffers(s, rOf(s, 'tarik')).find((a) => a.id === 'dues-payment');
  if (!offer_) {
    say(
      s,
      'tarik',
      'We need the agreed money and a free interval at home for both Burak and me. Please try after work.',
      'voice',
    );
    return;
  }
  const p = personOf(s, 'tarik');
  tick(p, Math.max(p.now, s.minute));
  const keep = offer('repayment-later', {
    action: 'rest',
    label: 'leave the payment for later',
    duration: 5,
    advertises: { autonomy: 0.1 },
  });
  const rec = decide(p, [offer_, keep], {
    now: s.minute,
    suggestion: { voiceId: KAPICI, affordanceId: offer_.id, strength: 0.5 },
  });
  if (rec.chosenAffordanceId === offer_.id) startMonthVisit(s, rOf(s, 'tarik'), offer_, rec);
  else say(s, 'tarik', 'Not now. I will keep the money aside and choose another time.', 'voice');
  kapiciDoes(s, 'arrange-private-payment', 2, 0.05);
  s.k.walk = { from: s.k.at, to: s.k.at, at0: s.minute, at1: s.minute + 2 };
}

/** Refuse mixed or unknown command contracts before recording or replay installation. */
export function validateInputContract(edition: string, input: NewInput | Input): void {
  const kinds = [
    'go',
    'start-work',
    'news',
    'tell',
    'invent',
    'word',
    'cast-pause',
    'sit',
    'misdeliver',
    'entrust',
    'help-story',
    'repayment',
    'seat',
    'knock',
    'prank',
    'next',
    'one-cast-depart',
  ];
  if (!canReplay(edition) || !input || !kinds.includes(input.kind))
    throw new Error('This notebook contains an unsupported command. Keep your file and start a new game.');
  if (
    input.kind === 'start-work' &&
    (edition !== WORK_START_VERSION ||
      !Number.isInteger(input.task) ||
      input.task < 0 ||
      Object.keys(input).some((key) => !['kind', 'task', 'at'].includes(key)))
  )
    throw new Error('Start work needs the separate work option in a new game. Keep your existing notebook.');
}
