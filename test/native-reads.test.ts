import { expect, test } from 'vitest';
import { buildingEngine, buildingIngress, buildingTravelMinutes, openBuilding } from '../src/sim/hf-game.ts';
import { bodyForecastHint } from '../src/sim/hf-hints.ts';
import { HF_MINUTE } from '../src/sim/hf-run.ts';
import { legsLine, readOf, tellables, wordHint } from '../src/ui/native-reads.ts';

test('public reads preserve unknown resident knowledge and do not mutate the run', () => {
  const world = openBuilding(7);
  const before = buildingEngine(world).checkpoint();
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
