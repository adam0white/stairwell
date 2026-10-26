import { createHash } from 'node:crypto';
import {
  credence,
  finish,
  provenanceOf,
  relationshipWith,
  seedBelief,
  seedSourceTrust,
  seedTie,
  trustOf,
} from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import {
  act,
  binsWarning,
  dayOf,
  dayStart,
  newGame,
  personOf,
  replay,
  rOf,
  step,
  talk,
  travelMinutes,
  wordHint,
} from '../src/sim/game.ts';
import { PRIVATE_FACTS } from '../src/sim/stories.ts';
import { isSaved } from '../src/ui/save.ts';

const MONTH = 'stairwell@10';
function visit(s: ReturnType<typeof newGame>, who: 'hacer' | 'burak') {
  s.k.at = `door:${who}`;
  rOf(s, who).where = 'home';
  const p = personOf(s, who);
  seedSourceTrust(p, 'kapici', 0.95);
  seedTie(p, { otherId: 'kapici', affection: 0.8, familiarity: 0.7, trust: 0.95 });
}

it('preserves complete edition9 state, RNG and continuation while month is explicit', () => {
  const s = newGame(11);
  act(s, { kind: 'go', to: 'bakery' });
  for (let i = 0; i < 480; i++) step(s);
  expect(createHash('sha256').update(JSON.stringify(s)).digest('hex')).toBe(
    'e1290ec2515ba5e872e83b31fe4332eb79e7d43a341e4dcc9370720beb5cd056',
  );
  const restored = replay(s.seed, s.inputs, s.minute, s.version);
  for (let i = 0; i < 20; i++) {
    step(s);
    step(restored);
  }
  expect(restored).toEqual(s);
});

it('continues weekly meetings to day28 and ends with a distinct stay decision', () => {
  const s = newGame(11, MONTH);
  for (const day of [6, 13, 20, 27]) {
    s.phase = 'night';
    s.minute = dayStart(day) + 1260;
    act(s, { kind: 'next' });
    expect(s.phase).toBe('sunday');
    expect(dayOf(s.minute)).toBe(day + 1);
    act(s, { kind: 'next' });
    expect(s.phase).toBe(day === 27 ? 'end' : 'day');
  }
  expect(s.month?.meetings).toHaveLength(4);
  expect(s.month?.stay).toBeTypeOf('boolean');
  expect(s.said.some((x) => /keep you as caretaker|not renew/.test(x.text))).toBe(true);
});

it('makes storm travel cost time and keeps shelter a resident choice', () => {
  const s = newGame(11, MONTH);
  s.minute = dayStart(9) + 16 * 60 - 1;
  step(s);
  expect(s.month?.rain.started).toBe(true);
  expect(travelMinutes(s, 'step', 'shop')).toBeGreaterThan(travelMinutes(newGame(11, MONTH), 'step', 'shop'));
  expect(s.said.some((x) => /awning/.test(x.text))).toBe(true);
});

it('separates honest parcel custody from a completed delivery and from mischief', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  rOf(s, 'burak').where = 'work';
  s.tasks.push({
    id: 999,
    kind: 'parcel',
    for: 'burak',
    label: 'a parcel',
    place: 'door:burak',
    from: s.minute,
    by: 20 * 60,
    carried: true,
  });
  act(s, { kind: 'entrust', who: 'hacer', task: 999 });
  const parcel = s.tasks.find((t) => t.id === 999)!;
  expect(parcel.custody).toBe('hacer');
  expect(parcel.done).toBeUndefined();
  expect(s.stamps.some((x) => x.id === 'wrong_door')).toBe(false);
  while (s.minute < 18 * 60 + 30) step(s);
  // Isolate an ordinary available home interval after work; both still decide through HF.
  for (const who of ['hacer', 'burak'] as const) {
    const p = personOf(s, who);
    if (p.activity)
      finish(p, {
        affordanceId: p.activity.affordanceId,
        action: p.activity.action,
        status: 'interrupted',
        at: Math.max(p.now, s.minute),
      });
    rOf(s, who).where = 'home';
    rOf(s, who).until = s.minute;
    seedTie(p, { otherId: who === 'hacer' ? 'burak' : 'hacer', affection: 0.8, trust: 0.8 });
  }
  for (let i = 0; i < 120 && !parcel.done; i++) step(s);
  expect(parcel.done).toBeDefined();
  expect(s.stamps.some((x) => x.id === 'safe_parcel')).toBe(true);
});

it('requires a discovered confidence and assent before private work produces an outcome', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  act(s, { kind: 'help-story', who: 'hacer' });
  expect(s.tasks.some((t) => t.storyFor)).toBe(false);
  while (dayOf(s.minute) < 15) {
    if (s.phase === 'day') step(s);
    else act(s, { kind: 'next' });
  }
  while (s.minute % 1440 < 16 * 60) step(s);
  s.secrets[PRIVATE_FACTS.hacer] = 3;
  visit(s, 'hacer');
  act(s, { kind: 'help-story', who: 'hacer' });
  const task = s.tasks.find((t) => t.storyFor === 'hacer');
  expect(task).toBeDefined();
  expect(s.month?.helped.hacer).toBeUndefined();
  for (let i = 0; i < 30; i++) step(s);
  expect(s.month?.helped.hacer).toBe(true);
  expect(s.stamps.some((x) => x.id === 'private_hacer')).toBe(true);
});

it('states the actual weekly Thursday morning condition before Sunday support', () => {
  const s = newGame(11, MONTH);
  s.minute = dayStart(8) + 420;
  expect(wordHint(s, 'hacer')).toContain('Thursday at 07:00');
  expect(wordHint(s, 'hacer')).toContain('face to face');
});

it('uses tactical slowdown for optional month reading and keeps edition9 pacing unchanged', async () => {
  const { playback } = await import('../src/ui/playback.ts');
  expect(playback(newGame(11, MONTH), true, false).rate).toBe(0.6);
  expect(playback(newGame(11, MONTH), false, true).rate).toBe(0.6);
  expect(playback(newGame(11), true, false).rate).toBe(0);
});

it('plays and replays the complete month with meals, fatigue, four votes and no silent edition switch', async () => {
  const { playDay } = await import('../scripts/policy.ts');
  const s = newGame(11, MONTH);
  while (s.phase !== 'end') {
    if (s.phase === 'day') playDay(s, 'honest');
    else act(s, { kind: 'next' });
  }
  expect(dayOf(s.minute)).toBe(28);
  expect(s.month?.meetings.map((m) => m.day)).toEqual([7, 14, 21, 28]);
  expect(s.people.every((p) => p.body.alive)).toBe(true);
  const compact = JSON.parse(
    JSON.stringify({ game: s.version, seed: s.seed, inputs: s.inputs, minute: s.minute }),
  );
  const full = { ...compact, state: structuredClone(s) };
  for (const file of [compact, full]) {
    expect(isSaved(file)).toBe(true);
    expect(replay(file.seed, file.inputs, file.minute, file.game)).toEqual(s);
  }
});

it('requires two actual seating consents and does not turn one invitation into reconciliation', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  act(s, { kind: 'seat', who: 'hacer', beside: 'burak' });
  expect(s.month?.seats.hacer).toBe('burak');
  s.phase = 'night';
  s.minute = dayStart(6) + 1260;
  act(s, { kind: 'next' });
  expect(s.said.some((x) => /chose neighbouring chairs/.test(x.text))).toBe(false);
  // Controlled reciprocal consent for the second meeting, not a claimed player journey.
  s.month!.seats.burak = 'hacer';
  s.phase = 'night';
  s.minute = dayStart(13) + 1260;
  act(s, { kind: 'next' });
  expect(s.said.some((x) => /chose neighbouring chairs/.test(x.text))).toBe(true);
  expect(s.stories?.feud.reconciled).toBe(false);
});

it('preserves complete testimony through relays and warns only after actual loyal testimony', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  act(s, { kind: 'tell', who: 'hacer', prop: 'tarik:nosy', value: true, sure: true });
  for (const who of ['hacer', 'sevim'] as const) {
    const p = personOf(s, who);
    p.conscience.norms = []; // Control isolates the released speech options from held refusal norms.
    seedTie(p, { otherId: 'tarik', affection: 0.8, trust: 0.8 });
  }
  seedSourceTrust(personOf(s, 'sevim'), 'hacer', 0.95);
  talk(s, 'hacer', 'sevim', 'step', 99);
  expect(
    s.month?.testimony.some(
      (x) => x.from === 'hacer' && x.to === 'sevim' && x.prop === 'tarik:nosy' && x.caretaker,
    ),
  ).toBe(true);
  expect(provenanceOf(personOf(s, 'sevim'), 'tarik:nosy')).toBeDefined();
  expect(relationshipWith(personOf(s, 'sevim'), 'tarik').affection).toBeLessThan(0.8);
  talk(s, 'sevim', 'tarik', 'step', 99);
  expect(rOf(s, 'tarik').grudges.some((x) => x.from === 'sevim' && x.prop === 'tarik:nosy')).toBe(true);
  expect(rOf(s, 'hacer').told).toHaveLength(1);
  expect(rOf(s, 'sevim').told).toHaveLength(0);
  expect(s.month?.testimony.some((x) => x.from === 'sevim' && x.to === 'tarik' && x.caretaker)).toBe(true);
});

it('uses the deliberate per-speaker threshold instead of guessing it from personality', () => {
  for (const [speaker, expected] of [
    ['hacer', true],
    ['burak', false],
  ] as const) {
    const s = newGame(11, MONTH);
    const p = personOf(s, speaker);
    p.memory.beliefs = [];
    p.conscience.norms = [];
    seedBelief(p, 'notice:probe', { value: true, credence: 0.68 });
    talk(s, speaker, 'sevim', 'step', 99);
    expect(s.talks.at(-1)?.props.includes('notice:probe')).toBe(expected);
  }
});

it('ties contradiction loss to retained opposite accounts and never repeats it for the same pair', () => {
  const s = newGame(11, MONTH);
  for (const [who, value] of [
    ['hacer', true],
    ['burak', false],
  ] as const) {
    visit(s, who);
    personOf(s, who).conscience.norms = [];
    act(s, { kind: 'tell', who, prop: 'sevim:kind', value, sure: true });
  }
  talk(s, 'hacer', 'burak', 'step', 99);
  const first = rOf(s, 'hacer').caught.length;
  expect(first).toBeGreaterThan(0);
  expect(credence(personOf(s, 'hacer'), 'kapici:dishonest')).toBeGreaterThan(0.5);
  expect(
    personOf(s, 'hacer').memory.contradictions?.some(
      (x) => x.sourceId === 'kapici' && x.prop === 'sevim:kind',
    ),
  ).toBe(true);
  const trust = trustOf(personOf(s, 'hacer'), 'kapici');
  s.minute += 121;
  talk(s, 'hacer', 'burak', 'step', 99);
  expect(rOf(s, 'hacer').caught).toHaveLength(first);
  expect(trustOf(personOf(s, 'hacer'), 'kapici')).toBe(trust);
});

it('warns before a bins route that cannot beat the actual truck deadline', () => {
  const s = newGame(11, MONTH);
  s.minute = 20 * 60 + 44;
  s.k.at = 'room';
  expect(binsWarning(s, 'landing:4')).toContain('after it leaves');
  s.minute = 19 * 60 + 30;
  expect(binsWarning(s, 'landing:4')).toContain('before then');
});

it('resolves actual Saturday sleep and Sunday morning before the vote for residents and caretaker', () => {
  const s = newGame(11, MONTH);
  while (dayOf(s.minute) < 6 || s.phase === 'day') {
    if (s.phase === 'day') step(s);
    else act(s, { kind: 'next' });
  }
  act(s, { kind: 'next' });
  expect(s.phase).toBe('sunday');
  expect(personOf(s, 'hacer').body.sleepDebt).toBeLessThan(1);
  expect(s.kapici.now).toBeGreaterThanOrEqual(s.minute);
  expect(s.people.every((p) => p.now >= s.minute)).toBe(true);
  act(s, { kind: 'next' });
  expect(personOf(s, 'hacer').body.sleepDebt).toBeLessThan(1);
  expect(s.kapici.now).toBe(s.minute);
});

it('never accuses a listener of receiving a historical value that neither selected direction said', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  act(s, { kind: 'tell', who: 'hacer', prop: 'tarik:nosy', value: true, sure: true });
  for (const [who, confidence] of [
    ['hacer', 0.9],
    ['sevim', 0.99],
  ] as const) {
    const p = personOf(s, who);
    p.memory.beliefs = [];
    p.conscience.norms = [];
    seedBelief(p, 'tarik:nosy', { value: false, credence: confidence, source: 'independent' });
  }
  const before = trustOf(personOf(s, 'sevim'), 'kapici');
  talk(s, 'hacer', 'sevim', 'step', 99);
  expect(
    s.month?.testimony
      .filter((x) => x.prop === 'tarik:nosy' && x.from !== 'kapici')
      .every((x) => x.value === false),
  ).toBe(true);
  expect(rOf(s, 'sevim').caught).toEqual([]);
  expect(trustOf(personOf(s, 'sevim'), 'kapici')).toBe(before);
  expect(s.said.some((x) => x.text.includes('Sevim knows better'))).toBe(false);
});

it('does not treat a repayment date as a meeting or transfer while both residents are away', () => {
  const s = newGame(11, MONTH);
  s.stories!.fund.agreed = true;
  s.month!.repaymentAt = s.minute + 1;
  rOf(s, 'tarik').where = 'work';
  rOf(s, 'tarik').until = s.minute + 100;
  rOf(s, 'burak').where = 'shop';
  rOf(s, 'burak').until = s.minute + 100;
  step(s);
  expect(s.month?.duesPaid).toBe(false);
  expect(s.stamps.some((x) => x.id === 'kept_dates')).toBe(false);
});

it('starts the custody trip after the recipient returns instead of crediting the prior absence', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  s.tasks.push({
    id: 999,
    kind: 'parcel',
    for: 'tarik',
    label: 'a parcel',
    place: 'door:tarik',
    from: 420,
    by: 1200,
    custody: 'hacer',
    custodyAt: 420,
  });
  s.minute = 1000;
  rOf(s, 'hacer').where = 'home';
  rOf(s, 'hacer').until = 1100;
  rOf(s, 'tarik').where = 'home';
  rOf(s, 'tarik').until = 1100;
  step(s);
  expect(s.tasks.find((t) => t.id === 999)?.done).toBeUndefined();
  expect(s.stamps.some((x) => x.id === 'safe_parcel')).toBe(false);
});

it('pays the authored weekly dues through actual visits, with conserved pension money and a final supplier receipt', () => {
  const s = newGame(11, MONTH);
  while (dayOf(s.minute) < 3) {
    if (s.phase === 'day') step(s);
    else act(s, { kind: 'next' });
  }
  s.boilerBroken = true;
  s.stories!.fund.bookRead = true;
  s.stories!.fund.consentPassed = true;
  visit(s, 'burak');
  act(s, { kind: 'news', who: 'burak' });
  expect(s.stories?.fund.agreed).toBe(true);
  expect(s.month?.tarikCash).toBe(0);
  expect(s.month?.paymentLedger).toEqual([]);
  while (s.phase !== 'end') {
    if (s.phase === 'night' && dayOf(s.minute) === 11) {
      expect(s.month?.tarikCash).toBe(0);
      expect(s.month?.paymentLedger).toEqual([]);
    }
    if (s.phase === 'day') {
      if (!s.k.walk && s.k.busyTask === null) {
        if (s.k.at === 'door:tarik' && s.minute % 10 === 0) act(s, { kind: 'repayment' });
        else if (s.k.at !== 'door:tarik') act(s, { kind: 'go', to: 'door:tarik' });
      }
      step(s);
    } else act(s, { kind: 'next' });
  }
  const month = s.month!;
  expect(month.paymentLedger).toHaveLength(3);
  expect(month.visits.filter((v) => v.kind === 'dues' && v.done !== undefined)).toHaveLength(3);
  expect(month.duesBalance).toBe(0);
  expect(month.tarikCash).toBe(0);
  expect(month.fundCash).toBe(0);
  expect(month.paymentLedger.reduce((sum, x) => sum + x.amount, 0)).toBe(600);
  expect(month.paymentLedger.reduce((sum, x) => sum + x.supplierPaid, 0)).toBe(600);
  expect(month.supplierBalance).toBe(0);
  expect(month.supplierLate).toBe(true);
  expect(s.stamps.filter((x) => x.id === 'kept_dates')).toHaveLength(1);
});

it('does not attach old caretaker lineage to an independent later belief of the same value', () => {
  const s = newGame(11, MONTH);
  visit(s, 'hacer');
  act(s, { kind: 'tell', who: 'hacer', prop: 'tarik:nosy', value: true, sure: true });
  const speaker = personOf(s, 'hacer');
  speaker.conscience.norms = [];
  seedBelief(speaker, 'tarik:nosy', { value: true, credence: 0.9, source: 'independent' });
  seedBelief(personOf(s, 'sevim'), 'tarik:nosy', { value: false, credence: 0.99, source: 'independent' });
  const trust = trustOf(personOf(s, 'sevim'), 'kapici');
  talk(s, 'hacer', 'sevim', 'step', 99);
  const receipt = s.month?.testimony.findLast(
    (x) => x.from === 'hacer' && x.to === 'sevim' && x.prop === 'tarik:nosy',
  );
  expect(receipt?.value).toBe(true);
  expect(receipt?.caretaker).toBeUndefined();
  expect(rOf(s, 'sevim').caught).toEqual([]);
  expect(trustOf(personOf(s, 'sevim'), 'kapici')).toBe(trust);
  expect(s.said.some((x) => x.text.includes('Sevim knows better'))).toBe(false);
});

it('keeps Derya’s actual overnight shift through the next morning, then lets it finish at eight', () => {
  const s = newGame(11, MONTH);
  while (s.phase === 'day') step(s);
  const work = personOf(s, 'derya').activity;
  expect(work?.affordanceId).toBe('derya-night-work');
  act(s, { kind: 'next' });
  expect(personOf(s, 'derya').activity?.affordanceId).toBe('derya-night-work');
  expect(personOf(s, 'derya').now).toBe(s.minute);
  while (s.minute < dayStart(2) + 480) step(s);
  expect(personOf(s, 'derya').activity?.action).toBe('sleep');
  expect(
    personOf(s, 'derya').memory.episodes.some((e) => e.summary.includes('finished the night shift')),
  ).toBe(true);
});
