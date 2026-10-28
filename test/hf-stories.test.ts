import { expect, test } from 'vitest';
import { FACTS } from '../src/sim/building-cast.ts';
import {
  applyBuildingEvents,
  buildingEngine,
  buildingTransaction,
  openBuilding,
} from '../src/sim/hf-game.ts';
import { beliefProbability } from '../src/sim/hf-readings.ts';
import {
  boilerFoundBuilding,
  ringEveningBuilding,
  storyClueBuilding,
  storyEventsBuilding,
  storyNewsBuilding,
  storyTellBuilding,
  tarikEnvelopeBuilding,
  trustedStoryListenerBuilding,
} from '../src/sim/hf-stories.ts';
import { PRIVATE_FACTS, STORY_FACTS, STORY_LINES } from '../src/sim/stories.ts';

test('authored disclosures update public belief and notebook once', () => {
  const w = openBuilding(7, 'stairwell@16');
  const before = beliefProbability(buildingEngine(w), 'kapici', STORY_FACTS.hacer);
  buildingTransaction(w, (c) => storyClueBuilding(c, 'hacer', STORY_FACTS.hacer, STORY_LINES.hacer));
  expect(beliefProbability(buildingEngine(w), 'kapici', STORY_FACTS.hacer)).toBeGreaterThan(before);
  expect(w.secrets[STORY_FACTS.hacer]).toBe(1);
  const lines = w.said.length;
  buildingTransaction(w, (c) => storyClueBuilding(c, 'hacer', STORY_FACTS.hacer, STORY_LINES.hacer));
  expect(w.said).toHaveLength(lines);
});
test('boiler and envelope scenes produce the named actual observations', () => {
  const w = openBuilding(7, 'stairwell@16');
  const before = beliefProbability(buildingEngine(w), 'kapici', FACTS.fund);
  buildingTransaction(w, (c) => {
    boilerFoundBuilding(c);
    tarikEnvelopeBuilding(c);
  });
  expect(w.boilerBroken).toBe(true);
  expect(w.tarik.envelope).toBe(true);
  expect(w.secrets[FACTS.fund]).toBe(1);
  expect(w.secrets[FACTS.dues]).toBe(1);
  expect(beliefProbability(buildingEngine(w), 'kapici', FACTS.fund)).toBeGreaterThan(before);
  expect(beliefProbability(buildingEngine(w), 'hacer', 'burak:dishonest')).toBeGreaterThan(0.5);
});
test('passing a discovered story requires real delivery callback', () => {
  const w = openBuilding(7, 'stairwell@16');
  buildingTransaction(w, (c) => storyClueBuilding(c, 'hacer', STORY_FACTS.hacer, STORY_LINES.hacer));
  expect(() => buildingTransaction(w, (c) => storyTellBuilding(c, 'sevim', STORY_FACTS.hacer, true))).toThrow(
    /callback/,
  );
  expect(w.stories!.feud.hacerPassed).toBe(false);
  let received = false;
  buildingTransaction(w, (c) =>
    storyTellBuilding(c, 'sevim', STORY_FACTS.hacer, true, (_world, who, prop, value, confidence, lie) => {
      expect([who, prop, value, confidence, lie]).toEqual(['sevim', STORY_FACTS.hacer, true, 0.95, false]);
      received = true;
    }),
  );
  expect(received).toBe(true);
  expect(w.stories!.feud.hacerPassed).toBe(true);
});
test('monthly agreement requires a dues callback and schedules both obligations', () => {
  const w = openBuilding(7, 'stairwell@16');
  for (let i = 0; i < 30 && !trustedStoryListenerBuilding(w, 'burak'); i++) {
    buildingTransaction(w, (c) =>
      applyBuildingEvents(c, [
        {
          kind: 'social.received',
          payload: {
            person: 'burak',
            other: 'kapici',
            evidenceId: `test:${i}`,
            event: { kind: 'gift', byMe: false, magnitude: 1 },
          },
        },
      ]),
    );
  }
  expect(trustedStoryListenerBuilding(w, 'burak')).toBe(true);
  w.boilerBroken = true;
  w.stories!.fund.bookRead = true;
  w.stories!.fund.consentPassed = true;
  expect(() => buildingTransaction(w, (c) => storyNewsBuilding(c, 'burak'))).toThrow(/dues/);
  expect(w.stories!.fund.agreed).toBe(false);
  let called = 0;
  buildingTransaction(w, (c) =>
    storyNewsBuilding(c, 'burak', () => {
      called++;
    }),
  );
  expect(called).toBe(1);
  expect(w.month!.supplierBalance).toBe(600);
  expect(w.month!.repaymentAt).toBe(11 * 1440 + 600);
  expect(w.stories!.fund.repairAt).toBe(1440 + 600);
});
test('paper ferry scene depends on the discovered account', () => {
  const w = openBuilding(7, 'stairwell@16');
  buildingTransaction(w, ringEveningBuilding);
  expect(w.ring.answer).toBe('not yet');
  w.secrets[PRIVATE_FACTS.burak] = 1;
  buildingTransaction(w, ringEveningBuilding);
  expect(w.ring.answer).toBe('yes');
  expect(w.stamps.some((s) => s.id === 'paper_ferry')).toBe(true);
});

test('scheduled repair occurs once when its time arrives', () => {
  const w = openBuilding(7, 'stairwell@16');
  w.boilerBroken = true;
  Object.assign(w.stories!.fund, { agreed: true, repairAt: w.minute });
  buildingTransaction(w, storyEventsBuilding);
  expect(w.stories!.fund.repaired).toBe(true);
  expect(w.boilerBroken).toBe(false);
  const lines = w.said.length;
  buildingTransaction(w, storyEventsBuilding);
  expect(w.said).toHaveLength(lines);
});
