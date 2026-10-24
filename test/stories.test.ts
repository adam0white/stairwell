import { relationshipWith, seedSourceTrust, seedTie } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import {
  act,
  claimWords,
  DAY_START,
  dayOf,
  dayStart,
  faceToFace,
  newGame,
  openTasks,
  type Place,
  personOf,
  replay,
  rOf,
  step,
  tellables,
  travelMinutes,
} from '../src/sim/game.ts';
import type { Rid } from '../src/sim/people.ts';
import { PRIVATE_FACTS, STORY_FACTS } from '../src/sim/stories.ts';

function visit(s: ReturnType<typeof newGame>, who: Rid) {
  s.k.at = `door:${who}`;
  s.k.walk = null;
  rOf(s, who).where = 'home';
  const p = personOf(s, who);
  seedSourceTrust(p, 'kapici', 0.9);
  seedTie(p, { otherId: 'kapici', affection: 0.6, familiarity: 0.5, trust: 0.8 });
}
function sitting(s: ReturnType<typeof newGame>, who: Rid, day: number) {
  s.minute = dayStart(day) + DAY_START;
  visit(s, who);
  act(s, { kind: 'sit', who });
}
function tell(s: ReturnType<typeof newGame>, who: Rid, prop: string, value = true) {
  visit(s, who);
  act(s, { kind: 'tell', who, prop, value, sure: true });
}

describe('v4 hidden resident stories', () => {
  it('keeps legacy state shape and gates clues on trust and repeated sitting', () => {
    expect(() => newGame(11, 'stairwell@3')).toThrow(/Start fresh/);
    const s = newGame(11);
    s.k.at = 'door:hacer';
    act(s, { kind: 'sit', who: 'hacer' });
    expect(s.secrets[STORY_FACTS.hacer]).toBeUndefined();
    sitting(s, 'hacer', 2);
    expect(s.secrets[STORY_FACTS.hacer]).toBeUndefined();
    sitting(s, 'hacer', 3);
    expect(s.secrets[STORY_FACTS.hacer]).toBe(3);
  });

  it('requires both discovered accounts and truthful cross-resident tells before tea', () => {
    const s = newGame(11);
    tell(s, 'sevim', STORY_FACTS.hacer);
    expect(s.stories?.feud.hacerPassed).toBe(false);
    for (const who of ['hacer', 'sevim'] as const) for (const day of [1, 2, 3]) sitting(s, who, day);
    expect(tellables(s, 'burak').find((x) => x.prop === STORY_FACTS.hacer)?.words).toContain('notice');
    tell(s, 'sevim', STORY_FACTS.hacer, false);
    expect(s.stories?.feud.hacerPassed).toBe(false);
    tell(s, 'sevim', STORY_FACTS.hacer);
    tell(s, 'hacer', STORY_FACTS.sevim);
    const affection = relationshipWith(personOf(s, 'hacer'), 'sevim').affection;
    s.minute = dayStart(6) + 17 * 60 - 1;
    s.k.walk = null;
    step(s);
    expect(s.stories?.feud.reconciled).toBe(true);
    expect(relationshipWith(personOf(s, 'hacer'), 'sevim').affection).toBeGreaterThan(affection);
    expect(s.stamps.filter((x) => x.id === 'two_cups')).toHaveLength(1);
    step(s);
    expect(s.stamps.filter((x) => x.id === 'two_cups')).toHaveLength(1);
  });

  it('requires the book and private consent, then repairs the boiler without charging the player', () => {
    const s = newGame(11);
    s.boilerBroken = true;
    for (const who of ['burak', 'tarik'] as const) for (const day of [1, 2, 3]) sitting(s, who, day);
    expect(s.stories?.fund.bookRead).toBe(true);
    tell(s, 'burak', STORY_FACTS.instalments);
    visit(s, 'burak');
    act(s, { kind: 'news', who: 'burak' });
    expect(s.stories?.fund.agreed).toBe(true);
    const money = s.k.money;
    s.minute = (s.stories?.fund.repairAt ?? 0) - 1;
    s.k.walk = null;
    step(s);
    expect(s.boilerBroken).toBe(false);
    expect(s.stories?.fund.repaired).toBe(true);
    expect(s.k.money).toBe(money);
    expect(s.stamps.some((x) => x.id === 'warm_stairs')).toBe(true);
  });

  it('does not turn an invented repayment claim into consent or a repair', () => {
    const s = newGame(11);
    s.boilerBroken = true;
    tell(s, 'burak', STORY_FACTS.instalments);
    visit(s, 'burak');
    act(s, { kind: 'news', who: 'burak' });
    expect(s.stories?.fund.agreed).toBe(false);
    expect(s.boilerBroken).toBe(true);
  });
});

/** A deterministic player uses only public actions: errands, visits, sitting and testimony. */
function publicStoryRun() {
  const s = newGame(1);
  const stopAt = dayStart(6) + 17 * 60 - 1;
  let guard = 0;
  while (s.minute < stopAt && guard++ < 12_000) {
    if (s.phase !== 'day') {
      act(s, { kind: 'next' });
      continue;
    }
    if (!s.k.walk && s.k.busyTask === null) {
      for (const who of faceToFace(s)) {
        const resident = rOf(s, who);
        if (resident.sitDay !== dayOf(s.minute)) {
          act(s, { kind: 'sit', who, ...(who === 'derya' ? { topic: 'boundaries' as const } : {}) });
          break;
        }
        const clues = [
          ['sevim', STORY_FACTS.hacer, s.stories?.feud.hacerPassed],
          ['hacer', STORY_FACTS.sevim, s.stories?.feud.sevimPassed],
          ['burak', STORY_FACTS.instalments, s.stories?.fund.consentPassed],
        ] as const;
        for (const [listener, prop, passed] of clues)
          if (who === listener && s.secrets[prop] && !passed) {
            expect(tellables(s, who).find((x) => x.prop === prop)?.words).not.toBe(prop);
            expect(tellables(s, who).find((x) => x.prop === prop)?.words).toBeTruthy();
            act(s, { kind: 'tell', who, prop, value: true, sure: true });
          }
        if (who === 'burak' && resident.newsDay !== dayOf(s.minute)) act(s, { kind: 'news', who });
        if (dayOf(s.minute) < 3 && !resident.told.some((x) => x.prop === 'notice:water'))
          act(s, { kind: 'tell', who, prop: 'notice:water', value: true, sure: true });
      }
      if (!s.k.walk) {
        const candidates = [
          ...new Set(openTasks(s).map((t) => (t.carried || !t.pickup ? t.place : t.pickup))),
        ].filter((place) => place !== s.k.at);
        candidates.sort((a, b) => travelMinutes(s, s.k.at, a) - travelMinutes(s, s.k.at, b));
        const visits: Place[] = ['door:hacer', 'door:sevim', 'door:burak', 'door:tarik', 'door:derya'];
        const visiting =
          s.minute % 1440 >= 15 * 60 + 30 && s.minute % 1440 < 19 * 60
            ? visits.find((place) => rOf(s, place.slice(5) as Rid).sitDay !== dayOf(s.minute))
            : undefined;
        const to = visiting ?? candidates[0] ?? visits[Math.floor(s.minute / 30) % visits.length];
        if (to) act(s, { kind: 'go', to });
      }
    }
    step(s);
  }
  expect(s.minute).toBe(stopAt);
  return s;
}

it('discovers both stories through public actions and replays complete state and future outcomes exactly', () => {
  const original = publicStoryRun();

  expect(original.stories?.fund.agreed).toBe(true);
  for (const fact of Object.values(PRIVATE_FACTS)) expect(original.secrets[fact], fact).toBeDefined();
  expect(original.stories?.feud.reconciled).toBe(false);
  const restored = replay(original.seed, original.inputs, original.minute, original.version);
  expect(restored).toEqual(original);
  while (original.phase === 'day') step(original);
  while (restored.phase === 'day') step(restored);
  expect(original.stories?.feud.reconciled).toBe(true);
  expect(original.stories?.fund.repaired).toBe(true);
  expect(restored).toEqual(original);
});

it('uses current testimony wording and refuses old editions explicitly', () => {
  expect(claimWords(STORY_FACTS.hacer, true, 'stairwell@7')).toContain('notice');
  expect(() => newGame(1, 'stairwell@3')).toThrow(/Start fresh/);
});
