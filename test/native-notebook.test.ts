import { restoreRun } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { KAPICI, RIDS } from '../src/sim/building-cast.ts';
import { buildingSpec, openingPerson } from '../src/sim/hf-authoring.ts';
import { buildingEngine, openBuilding } from '../src/sim/hf-game.ts';
import { admitted, BuildingRun } from '../src/sim/hf-run.ts';
import { openingWorld } from '../src/sim/hf-world.ts';
import {
  nativeFileNotebook,
  nativeNotebook,
  readNativeNotebook,
  restoreNativeNotebook,
} from '../src/ui/native-notebook.ts';

test('complete checkpoint and active HF activity survive a detached JSON round trip', () => {
  const world = openBuilding(7, 'stairwell@16');
  // Historical provenance stays detached and readable without current write authority.
  const receipts = { owned: {}, sources: { source: ['opaque'] }, authored: false, fileOrigin: false };
  const notebook = nativeNotebook(world, receipts);
  const before = structuredClone(notebook);
  const result = restoreNativeNotebook(JSON.parse(JSON.stringify(notebook)));
  expect(buildingEngine(result.world).checkpoint()).toEqual(buildingEngine(world).checkpoint());
  expect(buildingEngine(result.world).active).toEqual(buildingEngine(world).active);
  expect(result.castReceipts).toEqual(receipts);
  expect(notebook).toEqual(before);
  receipts.sources.source.push('changed');
  expect(notebook.castReceipts).toEqual({
    owned: {},
    sources: { source: ['opaque'] },
    authored: false,
    fileOrigin: false,
  });
});

test('metadata and full input log must match, and rejected old files stay untouched', () => {
  const notebook = nativeNotebook(openBuilding(4));
  for (const change of [
    (n: any) => {
      n.seed++;
    },
    (n: any) => {
      n.minute++;
    },
    (n: any) => {
      n.game = 'stairwell@15';
    },
    (n: any) => {
      n.inputs.push({ at: 1, kind: 'next' });
    },
    (n: any) => {
      n.extra = true;
    },
    (n: any) => {
      n.format = 'stairwell-notebook/3';
    },
  ]) {
    const input = structuredClone(notebook);
    change(input);
    const before = structuredClone(input);
    expect(() => readNativeNotebook(input)).toThrow(/Keep the file/);
    expect(input).toEqual(before);
  }
  expect(() => readNativeNotebook({ version: 'stairwell@11', inputs: [] })).toThrow(/Keep the file/);
});

test('file export retains detached source provenance without creating receipts', () => {
  const world = openBuilding(5);
  const before = buildingEngine(world).checkpoint();
  const provenance = { original: { some: 'source' } };
  const file = nativeFileNotebook(world, provenance);
  provenance.original.some = 'changed';
  expect(file.provenance).toEqual({ original: { some: 'source' } });
  expect(file.notebook).not.toHaveProperty('castReceipts');
  expect(restoreNativeNotebook(file.notebook)).not.toHaveProperty('castReceipts');
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});

test('cold native recovery binds valid HF archives to the actual world clock, seed and authored definitions', () => {
  const valid = nativeNotebook(openBuilding(7));
  expect(() => admitted(restoreRun(valid.engine.archive))).not.toThrow();
  const wrongSeed = structuredClone(valid);
  wrongSeed.seed = wrongSeed.engine.world.seed = 8;
  expect(() => readNativeNotebook(wrongSeed)).not.toThrow();
  expect(() => restoreNativeNotebook(wrongSeed)).toThrow(/Keep the file/);
  const wrongClock = structuredClone(valid);
  wrongClock.engine.world.protocol.phase++;
  wrongClock.engine.world.protocol.ingresses.push({
    phase: wrongClock.engine.world.protocol.phase,
    minute: wrongClock.minute,
    inputIds: [`stairwell:${wrongClock.engine.world.protocol.sequence++}`],
  });
  expect(() => readNativeNotebook(wrongClock)).not.toThrow();
  expect(() => restoreNativeNotebook(wrongClock)).toThrow(/Keep the file/);
  const spec = buildingSpec(7);
  const action = spec.definitions.actions.find((action) => action.id === 'work');
  if (!action) throw Error('Missing authored action');
  action.demands.effort = 0;
  const foreign = BuildingRun.open(
    spec,
    [...RIDS, KAPICI].map((id) => openingPerson(id as Parameters<typeof openingPerson>[0])),
    openingWorld(7, 'stairwell@14'),
  );
  const altered = { ...valid, engine: foreign.checkpoint() };
  expect(() => admitted(restoreRun(altered.engine.archive))).not.toThrow();
  expect(() => readNativeNotebook(altered)).not.toThrow();
  expect(() => restoreNativeNotebook(altered)).toThrow(/Keep the file/);
  expect(nativeNotebook(buildingEngine(openBuilding(7)).world)).toEqual(valid);
});

test('same-id valid public HF actors cannot replace the game’s authored fresh character', () => {
  const people = [...RIDS, KAPICI].map((id) => openingPerson(id as Parameters<typeof openingPerson>[0]));
  const changed = people.find((person) => person.id === 'hacer');
  if (!changed) throw Error('Missing Hacer fixture');
  changed.state.traits.honesty = 0;
  const foreign = BuildingRun.open(buildingSpec(7), people, openingWorld(7, 'stairwell@14'));
  const notebook = {
    format: 'stairwell-notebook/4',
    game: 'stairwell@14',
    seed: 7,
    minute: 420,
    inputs: [],
    engine: foreign.checkpoint(),
  };
  expect(() => admitted(restoreRun(notebook.engine.archive))).not.toThrow();
  expect(() => readNativeNotebook(notebook)).not.toThrow();
  expect(() => restoreNativeNotebook(notebook)).toThrow(/Keep the file/);
});
