/** Plain host-world data. HF actor ownership never enters this model. */
import type { Rid } from './building-cast.ts';
import type { MonthState } from './month.ts';
import type { StoryState } from './stories.ts';
export type Place = 'room' | 'step' | 'bakery' | 'shop' | 'roof' | `door:${Rid}` | `landing:${number}`;
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

export interface WorldState {
  month?: MonthState;
  castPauses?: Partial<Record<Rid, 'requested' | 'paused'>>;
  lifeNotes?: Partial<Record<Rid, string>>;
  /** Present only in v4. Legacy notebooks retain their exact serialized state. */
  stories?: StoryState;
  version: string;
  seed: number;
  minute: number;
  phase: Phase;
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
