import { DEFAULT_NORMS } from '@adam0white/human-framework';
import { expect, test } from 'vitest';
import { parcelPrivacyNorm } from '../src/sim/hf-authoring.ts';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  buildingIngress,
  openBuilding,
} from '../src/sim/hf-game.ts';
import { currentBody, currentNormUnderstanding } from '../src/sim/hf-readings.ts';

test('sitting is a real ten-minute rest with one daily authored story and actual completion', () => {
  const world = openBuilding(7);
  world.k.at = 'door:hacer';
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  const active = buildingEngine(world).active.find((activity) => activity.person === 'kapici');
  expect(active?.offer.durationMs).toBe(10 * 60000);
  expect(active?.offer.demands.effort).toBe(0.02);
  expect(world.residents.find((resident) => resident.id === 'hacer')?.sits).toBe(1);
  for (let i = 0; i < 10; i++) advanceBuildingMinute(world);
  expect(world.k.walk).toBeNull();
  const count = world.residents.find((resident) => resident.id === 'hacer')?.sits;
  actBuilding(world, { kind: 'sit', who: 'hacer' });
  expect(world.residents.find((resident) => resident.id === 'hacer')?.sits).toBe(count);
});

test('ringing the actual sleeping resident ends the real sleep through an owner interruption', () => {
  const world = openBuilding(7);
  while (world.minute < 480) advanceBuildingMinute(world);
  world.k.at = 'door:derya';
  expect(currentBody(buildingEngine(world), 'derya').state.asleep).toBe(true);
  actBuilding(world, { kind: 'knock', who: 'derya' });
  expect(currentBody(buildingEngine(world), 'derya').state.asleep).toBe(false);
  expect(world.knocks).toBe(1);
  expect(world.residents.find((resident) => resident.id === 'derya')?.until).toBe(486);
  for (let i = 0; i < 6; i++) advanceBuildingMinute(world);
  expect(buildingEngine(world).active.find((activity) => activity.person === 'derya')?.offer.actionId).toBe(
    'sleep',
  );
});

test('the public interpretation owner retains the existing fictional privacy understanding without a faith claim', () => {
  const world = openBuilding(7);
  const privacy = parcelPrivacyNorm();
  expect(DEFAULT_NORMS.some((norm) => norm.id === 'privacy')).toBe(false);
  expect(privacy.provenance).toEqual({
    kind: 'authored-world',
    author: 'stairwell',
    ruleId: 'parcel-privacy',
    edition: 'parcel-privacy/1',
  });
  expect(privacy.sources).toEqual([{ kind: 'assumption', ref: 'stairwell:329919a:misdeliver' }]);
  buildingIngress(world, [
    {
      kind: 'norm.interpretation-received',
      payload: {
        person: 'hacer',
        evidenceId: 'privacy-reflection',
        normId: 'privacy',
        standing: 'disliked',
        conviction: 0.4,
        provenance: structuredClone(privacy.provenance),
      },
    },
  ]);
  expect(currentNormUnderstanding(buildingEngine(world), 'hacer')).toContainEqual(
    expect.objectContaining({ normId: 'privacy', standing: 'disliked', conviction: 0.4 }),
  );
});
