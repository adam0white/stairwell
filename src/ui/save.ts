import type { CastChapter } from '../sim/cast-life.ts';
import { canReplay, DAY_START, type Input, type Place, TOP_FLOOR } from '../sim/game.ts';
import type { DeryaContinuity } from '../sim/one-cast.ts';
import { RIDS, type Rid } from '../sim/people.ts';
import type { CastReceipts } from './cast-continuity.ts';

export interface Saved {
  game: string;
  seed: number;
  inputs: Input[];
  minute?: number;
  oneCast?: DeryaContinuity;
  castChapter?: CastChapter;
  castReceipts?: CastReceipts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResident(value: unknown): value is Rid {
  return RIDS.some((id) => id === value);
}

function isPlace(value: unknown): value is Place {
  if (typeof value !== 'string') return false;
  if (['room', 'step', 'bakery', 'shop', 'roof'].includes(value)) return true;
  if (value.startsWith('door:')) return isResident(value.slice(5));
  return /^landing:\d+$/.test(value) && Number(value.slice(8)) <= TOP_FLOOR;
}

function isInput(value: unknown): value is Input {
  if (!isRecord(value) || !Number.isInteger(value.at) || (value.at as number) < DAY_START) return false;
  switch (value.kind) {
    case 'go':
      return isPlace(value.to);
    case 'news':
    case 'word':
    case 'cast-pause':
    case 'knock':
      return isResident(value.who);
    case 'sit':
      return (
        isResident(value.who) &&
        (value.topic === undefined || (value.who === 'derya' && value.topic === 'boundaries'))
      );
    case 'tell':
      return (
        isResident(value.who) &&
        typeof value.prop === 'string' &&
        typeof value.value === 'boolean' &&
        typeof value.sure === 'boolean'
      );
    case 'invent':
      return isResident(value.who) && isResident(value.about) && typeof value.trait === 'string';
    case 'misdeliver':
      return isResident(value.who) && Number.isInteger(value.task);
    case 'prank':
      return value.what === 'swap' || value.what === 'gate';
    case 'next':
    case 'one-cast-depart':
      return true;
    default:
      return false;
  }
}

/** Validate notebook structure before replay. Extra export metadata is allowed. */
export function isSaved(value: unknown): value is Saved {
  if (
    !isRecord(value) ||
    typeof value.game !== 'string' ||
    !canReplay(value.game) ||
    !Number.isFinite(value.seed) ||
    !Array.isArray(value.inputs)
  )
    return false;
  if (value.minute !== undefined && (!Number.isInteger(value.minute) || (value.minute as number) < DAY_START))
    return false;
  let previous = DAY_START;
  for (const input of value.inputs) {
    if (!isInput(input) || input.at < previous) return false;
    if (typeof value.minute === 'number' && input.at > value.minute) return false;
    previous = input.at;
  }
  return true;
}
