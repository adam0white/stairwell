import { expect, test } from 'vitest';
import { buildingOffer, buildingSpec, OPENING, openingPerson } from '../src/sim/hf-authoring.ts';
import { buildingEngine, chooseBuilding, openBuilding } from '../src/sim/hf-game.ts';
import { BuildingRun } from '../src/sim/hf-run.ts';

test('the game displays HF’s recorded phrasebook reply, including its reason, without read-time changes', () => {
  const world = openBuilding(17);
  chooseBuilding(world, 'hacer', [buildingOffer('hacer', 'wording-rest', 'rest', 2)], 'A direct request.', {
    voiceId: 'kapici',
    affordanceId: 'wording-rest',
    strength: 0.5,
    adviceId: 'wording-control',
  });
  const engine = buildingEngine(world);
  const read = () =>
    engine.inspect({
      perspective: { kind: 'person', observer: 'hacer' },
      people: ['hacer'],
      select: ['events'],
    });
  const event = read().events.find(
    (e) => 'access' in e && e.data.kind === 'suggestion-resolved' && e.data.adviceId === 'wording-control',
  );
  expect(event).toBeDefined();
  const text = event?.narration.map((line) => line.text).join(' ');
  expect(world.said).toContainEqual(expect.objectContaining({ who: 'hacer', kind: 'voice', text }));
  const before = engine.checkpoint();
  expect(read()).toEqual(read());
  expect(engine.checkpoint()).toEqual(before);
  expect(before.archive.initial.spec.definitions.lexicon.wordings?.['suggestion.resolved']).toEqual([
    '{verdict}{reason}',
  ]);
});

test('inability retains the authored reason instead of turning it into a refusal', () => {
  const person = openingPerson('hacer');
  person.state.body.injuries = [
    { id: 'sore-leg', part: 'leg', severity: 0.5, healRatePerDay: 0.1, since: OPENING },
  ];
  const run = BuildingRun.open(buildingSpec(17), [person], {});
  const offer = buildingOffer('hacer', 'too-hard', 'climb', 2, {
    demands: { effort: 1, focus: 0, mode: 'awake', requires: { moving: 1 } },
  });
  const source = { type: 'host' as const, id: 'stairwell' };
  run.ingest(OPENING, [
    {
      id: 'offers',
      at: OPENING,
      source,
      kind: 'offers.received',
      payload: { person: 'hacer', revision: 1, offers: [offer] },
    },
    {
      id: 'advice',
      at: OPENING,
      source,
      kind: 'suggestion.received',
      payload: {
        person: 'hacer',
        received: {
          kind: 'ordinary',
          suggestion: {
            voiceId: 'kapici',
            affordanceId: 'too-hard',
            strength: 1,
            adviceId: 'cannot-control',
          },
        },
      },
    },
    {
      id: 'decision',
      at: OPENING,
      source,
      kind: 'decision.requested',
      payload: { person: 'hacer', offerRevision: 1, reason: 'An impossible request.', treatment: 'ordinary' },
    },
  ]);
  const event = run
    .inspect({ perspective: { kind: 'person', observer: 'hacer' }, people: ['hacer'], select: ['events'] })
    .events.find(
      (e) => 'access' in e && e.data.kind === 'suggestion-resolved' && e.data.adviceId === 'cannot-control',
    );
  expect(event?.narration.map((line) => line.text).join(' ')).toBe(
    'I can’t do that. I haven’t the strength for it just now.',
  );
});
