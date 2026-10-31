/** Plain-language display projections. Nothing here changes game state or the stored journal text. */
import { RESIDENTS, type Rid } from '../sim/building-cast.ts';
import type { Place, Said, Task } from '../sim/building-types.ts';
import { claimWords, nameOf } from '../sim/building-words.ts';
import type { GameState } from '../sim/hf-view.ts';
import { clockOf } from '../sim/hf-view.ts';
import type { Tellable } from './native-reads.ts';

/** The caretaker's own lines are stored under the internal id `kapici`. */
export function speakerLabel(who: string): string {
  return who === 'kapici' ? 'You (the caretaker)' : nameOf(who);
}

/**
 * The host stores one line for each outcome of a completed reply. Which outcome it was is HF's choice and does
 * not depend on the caretaker's words. These are the stored lines, exactly as `hf-game.ts` writes them.
 */
export const REPLY_STORED = {
  accepted: 'I am glad you listened.',
  declined: 'I would rather leave it there.',
} as const;

/**
 * Each resident's own plain wording of the same two outcomes. Same event, same meaning, nothing added:
 * no thanks, reason, memory or promise beyond what the stored line already says. Chosen by resident and
 * outcome only, so it is deterministic and draws nothing. Display only; the stored text is not changed.
 */
const REPLY_WORDING: Record<Rid, { accepted: string; declined: string }> = {
  hacer: { accepted: 'I am glad you listened.', declined: 'I would rather leave it there.' },
  sevim: { accepted: 'I am glad you were listening.', declined: 'I would rather we left it there.' },
  burak: { accepted: 'I’m glad you listened.', declined: 'I would rather leave it at that.' },
  derya: { accepted: 'I am glad that you listened.', declined: 'I’d rather leave it there.' },
  tarik: { accepted: 'Glad you listened.', declined: 'I would sooner leave it there.' },
};

/** The resident's wording for a stored reply outcome; any other line is returned as stored. */
export function replyWording(who: string, text: string): string {
  const wording = RESIDENTS[who as Rid] ? REPLY_WORDING[who as Rid] : undefined;
  if (!wording) return text;
  return text === REPLY_STORED.accepted
    ? wording.accepted
    : text === REPLY_STORED.declined
      ? wording.declined
      : text;
}

const CLAIM_TRAITS = [
  'stingy',
  'generous',
  'nosy',
  'kind',
  'cruel',
  'lazy',
  'hardworking',
  'honest',
  'dishonest',
  'reliable',
  'unreliable',
  'owes',
] as const;

/** A resident's news about another resident is their claim. This names the speaker; it changes no meaning. */
export function receivedClaim(who: string, text: string): string {
  const speaker = RESIDENTS[who as Rid];
  if (!speaker) return text;
  const isClaim = (Object.keys(RESIDENTS) as Rid[]).some(
    (about) =>
      about !== who &&
      CLAIM_TRAITS.some((trait) =>
        [true, false].some((value) => claimWords(`${about}:${trait}`, value) === text),
      ),
  );
  return isClaim ? `${speaker.name} says ${text}` : text;
}

/** What a resident's last line reads as in a conversation panel. Display only; the stored line is unchanged. */
export function spokenLine(who: string, text: string): string {
  return receivedClaim(who, replyWording(who, text));
}

/** A trailing `(₺5)` on a resident's thanks is the tip they gave. The stored text is untouched. */
export function splitTip(text: string): { text: string; tip?: number } {
  const match = /^(.*?)\s*\(₺(\d+)\)$/s.exec(text);
  return match ? { text: match[1] ?? text, tip: Number(match[2]) } : { text };
}

/** Display a learned claim without adding details that were not spoken. */
export function notebookClaimTitle(prop: string, title: string): string {
  return prop === 'tarik:kind' ? 'Tarık is said to be kind.' : title;
}

/** Witness lines record that someone noticed. The game shows no reading of what they made of it. */
export function isWitnessLine(text: string): boolean {
  return /\bsaw you do it\.$/.test(text);
}
export const WITNESS_NOTE = 'You do not know what they think of it.';

/** Distinct accessible names for identically worded claim buttons. The visible text stays first. */
export function tellLabel(tell: Pick<Tellable, 'words'>, sure: boolean): string {
  return `${sure ? 'for certain' : 'as I heard it'}: ${tell.words}`;
}

export const TELL_EXPLAINED =
  '“As I heard it” passes the news on as something you only heard. “For certain” says you know it is true. “Make something up” tells a story you invented. Residents compare what you told them, and a story that proves false can cost you their trust.';
export const REPLY_EXPLAINED =
  'Both replies are only your words. Each takes two minutes, and the resident chooses whether to go on. Which words you pick does not change that choice.';
export const SKIP_ENDPOINT =
  'Jumps ahead until the first new journal line, a change in your orders, someone arriving at or leaving the place you are in, or the end of the day. It never goes past 14 hours.';
export const NOTEBOOK_EXPLAINED =
  'The flats show only what you could tell from outside. This game does not show you what another person feels about you or how far they trust your word, so those lines say “You don’t know”. These are readings, not scores, and the game gives no promise about the Sunday vote. “What you have learned” counts facts that reached your notebook, such as news, stories and labels.';
export const ROLE_EXPLAINED =
  'Kapıcı is the Turkish word for caretaker, which is your job here. ₺ is the Turkish lira. An amount in brackets after a thank-you, such as (₺5), is a tip the resident gave you.';
export const EDITION_EXPLAINED =
  'Leave both boxes empty for the six-day week that ends with the Sunday vote on your tea money. Each box starts a four-week game instead. The second box also leaves out earlier shared character history.';
export const SAVE_EXPLAINED =
  'Progress is saved in this browser as you play. If saving fails, the game says so. Return to this page and choose Check and continue.';
export const VOTE_EXPLAINED =
  'At each Sunday meeting the five flats vote separately. Four yes votes win it. Nobody’s vote is promised.';
export const GATE_NOTE =
  'Stays open for about 90 minutes. Neighbours may see you, and something may follow later.';
export const SWAP_NOTE = 'A prank: each gets the other’s crossword. Someone nearby may see you do it.';

export type PauseCause = {
  talking: boolean;
  inspecting: boolean;
  /** The brief hold after new words appear, so they can be read. */
  holding: boolean;
  /** The name of what is open, when something is being read. */
  reading?: 'notebook' | 'orders' | 'residents' | 'tell' | 'invent' | 'information';
  who?: Rid;
  month: boolean;
};

/** The true cause of a stopped or slowed clock. Short enough for the status line at any width. */
export function pauseNotice(cause: PauseCause): string | undefined {
  const state = cause.month ? 'moves slowly' : 'is paused';
  if (cause.inspecting) {
    const open =
      cause.reading === 'notebook'
        ? 'the notebook'
        : cause.reading === 'orders'
          ? 'the orders list'
          : cause.reading === 'residents'
            ? 'the residents list'
            : cause.reading === 'tell' || cause.reading === 'invent'
              ? `what to tell ${cause.who ? RESIDENTS[cause.who].name : 'them'}`
              : 'the information page';
    return `You are reading ${open}. Time ${state}.`;
  }
  if (cause.talking) return `${cause.who ? RESIDENTS[cause.who].name : 'Someone'} is talking. Time ${state}.`;
  if (cause.holding)
    return cause.month
      ? 'New words are on screen. Time moves slowly for a few seconds.'
      : 'New words are on screen. Time waits a few seconds.';
  return undefined;
}

/** What ends the pause, shown beside the thing that causes it. */
export function resumeNote(kind: 'reading' | 'talking', month: boolean): string {
  const state = month ? 'Time moves slowly' : 'Time is paused';
  return kind === 'reading'
    ? `${state} while this is open. Close it (✕). If a conversation is still open, ${month ? 'time stays slow' : 'time stays paused'} until you close that too.`
    : `${state} while you talk. Close the conversation (✕), or choose a place to go, to carry on.`;
}

/** A journal row as shown. `key` is the display anchor and is never a stored line number. */
export type JournalRow = { said: Said; key: string };

/**
 * The world passes on a parcel left with a neighbour without a spoken line. This derives one display row per
 * such parcel from the task records. Each key is task-specific and cannot equal a stored line number, so
 * scroll restoration finds the row it saved. Nothing here is written to the stored journal, input or replay.
 */
export function parcelNotices(tasks: readonly Task[]): JournalRow[] {
  return tasks.flatMap((task) =>
    task.wrongDoor !== undefined && task.done !== undefined
      ? [
          {
            key: `parcel:${task.id}`,
            said: {
              at: task.done,
              who: 'narrator',
              kind: 'event' as const,
              text: `${RESIDENTS[task.for].name}’s parcel, ${parcelStatus(task).text}, was marked delivered at ${clockOf(task.done)}. You did not carry it to the door.`,
            },
          },
        ]
      : [],
  );
}

/** Stored lines keep their order and their line number; each notice goes after the last line at or before its time. */
export function journalRows(said: readonly Said[], notices: readonly JournalRow[]): JournalRow[] {
  const rows: JournalRow[] = said.map((line) => ({ said: line, key: String(line.n ?? '') }));
  for (const notice of notices) {
    let at = rows.length;
    while (at > 0 && (rows[at - 1]?.said.at ?? 0) > notice.said.at) at--;
    rows.splice(at, 0, notice);
  }
  return rows;
}

/** Where a parcel is, from the caretaker's records. `left` means a neighbour holds it. */
export function parcelStatus(task: Pick<Task, 'carried' | 'wrongDoor' | 'done'>): {
  kind: 'carried' | 'collect' | 'left' | 'delivered';
  text: string;
} {
  if (task.wrongDoor !== undefined) {
    const holder = nameOf(task.wrongDoor);
    return task.done !== undefined
      ? { kind: 'delivered', text: `left with ${holder}, who passed it on without you` }
      : { kind: 'left', text: `left with ${holder}, who said they would see it gets there` };
  }
  return task.done !== undefined
    ? { kind: 'delivered', text: 'delivered' }
    : task.carried
      ? { kind: 'carried', text: 'you are carrying it' }
      : { kind: 'collect', text: 'waiting to be collected' };
}

/** Only a carried parcel at its own absent recipient's door is awaiting handover here. */
export function pendingParcelAtDoor(s: GameState, task: Task, to: Place): boolean {
  return (
    task.kind === 'parcel' &&
    task.done === undefined &&
    task.from <= s.minute &&
    !!task.carried &&
    task.wrongDoor === undefined &&
    task.custody === undefined &&
    task.place === `door:${task.for}` &&
    to === task.place &&
    s.k.at === task.place &&
    s.residents.some((resident) => resident.id === task.for && resident.where !== 'home')
  );
}
