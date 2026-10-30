import { expect, test } from 'vitest';
import { buildingSpec, OPENING, openingPerson } from '../src/sim/hf-authoring.ts';
import { buildingEngine, buildingIngress, buildingTravelMinutes, openBuilding } from '../src/sim/hf-game.ts';
import { bodyForecastHint } from '../src/sim/hf-hints.ts';
import { BuildingRun, HF_MINUTE } from '../src/sim/hf-run.ts';
import { nativeOwnerProjection } from '../src/ui/native-owner-core.ts';
import {
  installNativeProjection,
  legsLine,
  readOf,
  selfReading,
  selfReadingFromRun,
  tellables,
  wordHint,
} from '../src/ui/native-reads.ts';

test('public reads preserve unknown resident knowledge and do not mutate the run', () => {
  const world = openBuilding(7);
  const before = buildingEngine(world).checkpoint();
  expect(selfReading(world).join(' ')).toMatch(/You feel|Your mood/);
  expect(selfReading(world).join(' ')).not.toMatch(/\d/);
  expect(readOf(world, 'hacer').warmth).toContain("don't know");
  expect(wordHint(world, 'hacer')).toContain('Thursday');
  expect(tellables(world, 'sevim').some((item) => item.prop === 'secret:unseen')).toBe(false);
  const duration = buildingTravelMinutes(world, world.k.at, 'roof');
  expect(legsLine(world, 'roof')).toBe(
    bodyForecastHint(buildingEngine(world), [
      { label: 'climb', durationMs: duration * HF_MINUTE, load: { effort: 0.85, focus: 0, mode: 'awake' } },
      {
        label: 'the next errands',
        durationMs: 120 * HF_MINUTE,
        load: { effort: 0.5, focus: 0, mode: 'awake' },
      },
    ]),
  );
  expect(legsLine(world, 'step')).toBe('');
  expect(buildingEngine(world).checkpoint()).toEqual(before);
});

test('actual testimony is tellable from the caretaker and withheld from its source and duplicate recipient', () => {
  const world = openBuilding(7);
  buildingIngress(world, [
    {
      kind: 'testimony.received',
      payload: {
        person: 'kapici',
        evidenceId: 'heard-1',
        teller: 'hacer',
        claims: [
          {
            prop: 'derya:visitor',
            value: true,
            confidence: 0.99,
            sourceId: 'hacer',
            evidenceId: 'claim-1',
            provenance: ['heard-1'],
          },
        ],
      },
    },
  ]);
  expect(tellables(world, 'sevim')).toContainEqual(
    expect.objectContaining({ prop: 'derya:visitor', value: true }),
  );
  expect(tellables(world, 'hacer').some((item) => item.prop === 'derya:visitor')).toBe(false);
  expect(tellables(world, 'derya').some((item) => item.prop === 'derya:visitor')).toBe(false);
  const recipient = world.residents.find((person) => person.id === 'sevim');
  if (!recipient) throw Error('Missing receiving resident');
  recipient.told.push({ prop: 'derya:visitor', value: true, at: world.minute, lie: false });
  expect(tellables(world, 'sevim').some((item) => item.prop === 'derya:visitor')).toBe(false);
});

test('live self readings express authored emotion, body and learned expectations without changing the run', () => {
  const person = openingPerson('kapici');
  person.state.affect.mood.valence = -0.5;
  person.state.affect.emotions = [
    { id: 'grief', intensity: 0.8, cause: 'loss', since: OPENING, halfLifeMs: 3600000 },
  ];
  person.state.body.pain = 0.8;
  person.state.expectations = [
    { key: 'tea', needs: {}, samples: 2, successRate: 1, valence: 0.5 },
    { key: 'visit@hacer', needs: {}, samples: 2, successRate: 1, valence: -0.5 },
  ];
  const run = BuildingRun.open(buildingSpec(7), [person], {});
  const before = run.checkpoint();
  const words = selfReadingFromRun(run);
  expect(words).toContain('You are grieving.');
  expect(words).toContain('You are in pain.');
  expect(words).toContain('You expect having tea to feel good.');
  expect(words).toContain('You expect visiting with Hacer to feel unpleasant.');
  expect(words.join(' ')).not.toMatch(/\d/);
  expect(run.checkpoint()).toEqual(before);
});

test('worker projection contains the same self reading and hides resident private affect', () => {
  const world = openBuilding(7);
  const before = buildingEngine(world).checkpoint();
  const expected = selfReading(world);
  const projection = nativeOwnerProjection(world, []);
  expect(projection.selfReading).toEqual(expected);
  expect(projection.reads.hacer.warmth).toContain("don't know");
  expect(projection.reads.hacer.word).toContain("don't know");
  expect(buildingEngine(world).checkpoint()).toEqual(before);
  const detached = structuredClone(world);
  installNativeProjection(detached, structuredClone(projection));
  expect(selfReading(detached)).toEqual(expected);
});
