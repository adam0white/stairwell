import {
  exportRun,
  type RunJournalChunk,
  type RunJournalHead,
  type RunJournalOpening,
  restoreRunJournal,
} from '@adam0white/human-framework';
import { assertPlainBuildingData } from '../sim/building-decode.ts';
import type { Input } from '../sim/building-types.ts';
import { buildingEngine } from '../sim/hf-game.ts';
import { replayBuilding } from '../sim/hf-replay.ts';
import type { BuildingCheckpoint } from '../sim/hf-run.ts';
import type { BuildingEdition, BuildingWorld } from '../sim/hf-world.ts';
import { validateNativeReceiptMetadata } from '../sim/native-cast-life.ts';

export type NativeJournalSnapshot = {
  token: number;
  world: BuildingWorld;
  receipts?: unknown;
  journal: {
    opening?: RunJournalOpening;
    chunk: RunJournalChunk | null;
    head: RunJournalHead;
  };
};

export function notebookFromJournal(
  world: BuildingWorld,
  receipts: unknown,
  journal: {
    opening: RunJournalOpening;
    chunks: RunJournalChunk[];
    head: RunJournalHead;
  },
): NativeNotebook {
  const restored = restoreRunJournal(journal);
  if (!restored.ok)
    throw new Error('The saved journal cannot be restored. Start fresh. Keep the original notebook.');
  return readNativeNotebook({
    format: 'stairwell-notebook/4',
    game: world.version,
    seed: world.seed,
    minute: world.minute,
    inputs: world.inputs,
    engine: {
      format: 'stairwell-engine/1',
      world,
      archive: exportRun(restored.value.run),
    },
    ...(receipts === undefined ? {} : { castReceipts: receipts }),
  });
}

export type NativeNotebook = {
  format: 'stairwell-notebook/4';
  game: BuildingEdition;
  seed: number;
  minute: number;
  inputs: Input[];
  engine: BuildingCheckpoint<BuildingWorld>;
  castReceipts?: unknown;
};
export type NativeFileNotebook = {
  format: 'stairwell-file/4';
  notebook: NativeNotebook;
  provenance: unknown;
};

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => same(value, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a).sort(),
    other = Object.keys(b).sort();
  return keys.length === other.length && keys.every((key, i) => key === other[i] && same(a[key], b[key]));
};
const invalid = (): never => {
  throw new Error('This notebook cannot be opened by this game version. Start fresh. Keep the file.');
};

/** Complete detached checkpoint; receipts are provenance, never ownership. */
export function nativeNotebook(world: BuildingWorld, castReceipts?: unknown): NativeNotebook {
  const engine = buildingEngine(world).checkpoint();
  return structuredClone({
    format: 'stairwell-notebook/4' as const,
    game: world.version as BuildingEdition,
    seed: world.seed,
    minute: world.minute,
    inputs: world.inputs,
    engine,
    ...(castReceipts === undefined ? {} : { castReceipts }),
  });
}

/** Validate envelope and binding. The host decoder validates the full world on restore. */
export function readNativeNotebook(input: unknown): NativeNotebook {
  try {
    assertPlainBuildingData(input);
  } catch {
    return invalid();
  }
  if (!object(input)) return invalid();
  const keys = Object.keys(input).sort().join(',');
  if (
    keys !== 'engine,format,game,inputs,minute,seed' &&
    keys !== 'castReceipts,engine,format,game,inputs,minute,seed'
  )
    return invalid();
  if (
    input.format !== 'stairwell-notebook/4' ||
    !['stairwell@14', 'stairwell@15', 'stairwell@16'].includes(input.game as string) ||
    typeof input.seed !== 'number' ||
    !Number.isFinite(input.seed) ||
    !Number.isSafeInteger(input.minute) ||
    (input.minute as number) < 0 ||
    !Array.isArray(input.inputs) ||
    !object(input.engine) ||
    Object.keys(input.engine).sort().join(',') !== 'archive,format,world' ||
    input.engine.format !== 'stairwell-engine/1' ||
    !object(input.engine.world)
  )
    return invalid();
  const world = input.engine.world;
  const archive = input.engine.archive;
  if (
    !object(archive) ||
    !object(archive.engine) ||
    archive.engine.package !== '@adam0white/human-framework@4.14.0' ||
    archive.engine.build !== 'c82ab38fa5565c2afbb976f644a75346316608842deaccdc65c13a4bd4a8c4c0' ||
    archive.engine.schema !== 'f951128cd79e831ee5225eb0bf04b4d30b61d206f75b85f957a90c475f0665e0'
  )
    throw new Error('This save needs an older game version. Keep the original notebook and start fresh.');
  if (
    world.version !== input.game ||
    world.seed !== input.seed ||
    world.minute !== input.minute ||
    !Array.isArray(world.inputs) ||
    !same(input.inputs, world.inputs)
  )
    return invalid();
  validateNativeReceiptMetadata(input.castReceipts);
  return structuredClone(input) as NativeNotebook;
}

export function restoreNativeNotebook(input: unknown): {
  world: BuildingWorld;
  castReceipts?: unknown;
} {
  const notebook = readNativeNotebook(input);
  const world = replayBuilding(notebook.engine);
  return {
    world,
    ...(Object.hasOwn(notebook, 'castReceipts') ? { castReceipts: notebook.castReceipts } : {}),
  };
}

/** Preserve file provenance separately from opaque source receipts. */
export function nativeFileNotebook(world: BuildingWorld, provenance: unknown): NativeFileNotebook {
  return structuredClone({
    format: 'stairwell-file/4' as const,
    notebook: nativeNotebook(world),
    provenance,
  });
}
