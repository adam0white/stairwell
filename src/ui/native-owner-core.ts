/** Game operations stay beside the actual public HF Run. No actor crosses this boundary. */

import type { RunJournalCursor } from '@adam0white/human-framework';
import { RIDS, type Rid } from '../sim/building-cast.ts';
import type { Place } from '../sim/building-types.ts';
import { currentDeparture } from '../sim/hf-cast.ts';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  buildingTravelMinutes,
  openBuilding,
} from '../sim/hf-game.ts';
import { currentBody } from '../sim/hf-readings.ts';
import { binsWarning } from '../sim/hf-view.ts';
import type { BuildingWorld } from '../sim/hf-world.ts';
import { admitNativeCast, validateNativeChapter } from '../sim/native-cast-life.ts';
import { exportNativeFile, readNativeFileText } from './native-file.ts';
import { nativeNotebook, restoreNativeNotebook } from './native-notebook.ts';
import { legsLine, type NativeProjection, readOf, selfReading, tellables, wordHint } from './native-reads.ts';
import { untilSomethingHappens } from './playback.ts';
import { requirePortableWrite } from './portable-write-guard.ts';

export type OwnerOperation = (
  | { kind: 'open'; args: Parameters<typeof openBuilding> }
  | { kind: 'notebook'; input: unknown }
  | { kind: 'file'; input: string }
  | { kind: 'act'; input: Parameters<typeof actBuilding>[1] }
  | { kind: 'step' }
  | { kind: 'wait' }
  | { kind: 'snapshot'; receipts?: unknown }
  | { kind: 'journal'; receipts?: unknown }
  | { kind: 'journal-commit'; token: number }
  | { kind: 'export'; provenance: unknown; receipts: unknown }
  | { kind: 'person'; id: Rid }
  | { kind: 'checkpoint' }
  | {
      kind: 'admit';
      input: Parameters<typeof admitNativeCast>[0];
      edition: Parameters<typeof admitNativeCast>[1];
    }
  | { kind: 'chapter'; value: Parameters<typeof validateNativeChapter>[2] }
  | { kind: 'project' }
) & { forecasts?: Place[]; expectedRevision?: number };
export type OwnerView = {
  world: BuildingWorld;
  projection: NativeProjection;
  revision: number;
  provenance?: unknown;
  receipts?: unknown;
};
const places: Place[] = [
  'room',
  'step',
  'bakery',
  'shop',
  'roof',
  ...RIDS.map((id) => `door:${id}` as Place),
  ...[0, 1, 2, 3, 4].map((n) => `landing:${n}` as Place),
];
export function nativeOwnerProjection(world: BuildingWorld, forecasts: Place[]): NativeProjection {
  return {
    selfReading: selfReading(world),
    reads: Object.fromEntries(RIDS.map((id) => [id, readOf(world, id)])) as NativeProjection['reads'],
    words: Object.fromEntries(RIDS.map((id) => [id, wordHint(world, id)])) as NativeProjection['words'],
    tell: Object.fromEntries(RIDS.map((id) => [id, tellables(world, id)])) as NativeProjection['tell'],
    legs: Object.fromEntries(forecasts.map((to) => [to, legsLine(world, to)])),
    travel: Object.fromEntries(
      places.flatMap((from) => places.map((to) => [`${from}|${to}`, buildingTravelMinutes(world, from, to)])),
    ),
    bins: Object.fromEntries(places.map((to) => [to, binsWarning(world, to)])),
  };
}
export function createNativeOwnerDispatcher(
  options: { project?: typeof nativeOwnerProjection; wait?: typeof untilSomethingHappens } = {},
) {
  let world: BuildingWorld | undefined;
  let revision = 0;
  let journalCursor: RunJournalCursor | undefined;
  let journalProposal: { token: number; cursor: RunJournalCursor } | undefined;
  let journalToken = 0;
  let committedJournalToken = 0;
  const dispatch = (operation: OwnerOperation): unknown => {
    if (operation.expectedRevision !== undefined && operation.expectedRevision !== revision)
      throw Error('Stale game worker request.');
    let provenance: unknown, receipts: unknown;
    if (operation.kind === 'open') {
      journalCursor = undefined;
      world = openBuilding(...operation.args);
      revision++;
    } else if (operation.kind === 'notebook') {
      journalCursor = undefined;
      const restored = restoreNativeNotebook(operation.input);
      world = restored.world;
      receipts = restored.castReceipts;
      revision++;
    } else if (operation.kind === 'file') {
      journalCursor = undefined;
      const restored = readNativeFileText(operation.input);
      world = restored.world;
      provenance = restored.provenance;
      revision++;
    } else {
      if (!world) throw Error('No game is open in this worker.');
      if (operation.kind === 'journal-commit') {
        if (operation.token === committedJournalToken) return;
        if (!journalProposal || journalProposal.token !== operation.token)
          throw Error('Stale journal commit.');
        journalCursor = journalProposal.cursor;
        committedJournalToken = operation.token;
        journalProposal = undefined;
        return;
      }
      if (operation.kind === 'journal') {
        let result: ReturnType<ReturnType<typeof buildingEngine>['exportJournal']>;
        try {
          result = buildingEngine(world).exportJournal(journalCursor);
        } catch (error) {
          if (!journalCursor) throw error;
          result = buildingEngine(world).exportJournal();
        }
        const { cursor, ...journal } = result;
        const token = ++journalToken;
        journalProposal = { token, cursor };
        return structuredClone({
          token,
          journal,
          world,
          receipts: operation.receipts,
        });
      }
      if (operation.kind === 'admit') return admitNativeCast(operation.input, operation.edition);
      if (operation.kind === 'chapter')
        return validateNativeChapter(
          world.version,
          buildingEngine(world).checkpoint().archive.initial.people,
          operation.value,
        );
      if (operation.kind === 'snapshot') return nativeNotebook(world, operation.receipts);
      if (operation.kind === 'export')
        return exportNativeFile(world, operation.provenance, operation.receipts);
      if (operation.kind === 'checkpoint') return buildingEngine(world).checkpoint();
      if (operation.kind === 'person') {
        requirePortableWrite(operation.id);
        return {
          body: currentBody(buildingEngine(world), operation.id).state,
          now: buildingEngine(world).now,
          departure: currentBody(buildingEngine(world), operation.id).state.alive
            ? {
                transfer: currentDeparture(buildingEngine(world), operation.id, []).transfer,
              }
            : undefined,
        };
      }
      if (operation.kind === 'act') {
        actBuilding(world, operation.input);
        revision++;
      } else if (operation.kind === 'step') {
        advanceBuildingMinute(world);
        revision++;
      } else if (operation.kind === 'wait') {
        const minute = world.minute;
        try {
          (options.wait ?? untilSomethingHappens)(world);
          revision++;
        } catch (error) {
          if (world.minute !== minute) revision++;
          throw error;
        }
      }
    }
    if (!world) throw Error('No game was opened.');
    return structuredClone({
      world,
      projection: (options.project ?? nativeOwnerProjection)(world, operation.forecasts ?? []),
      revision,
      provenance,
      receipts,
    } satisfies OwnerView);
  };
  dispatch.revision = () => revision;
  return dispatch;
}
export type OwnerPerson = {
  body: ReturnType<typeof currentBody>['state'];
  now: number;
  departure?: Pick<ReturnType<typeof currentDeparture>, 'transfer'>;
};
