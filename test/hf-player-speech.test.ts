import { expect, test } from 'vitest';
import { buildingEngine, buildingTransaction, openBuilding } from '../src/sim/hf-game.ts';
import { askNewsBuilding, tellBuilding } from '../src/sim/hf-player-speech.ts';
import {
  beliefProbability,
  currentNormUnderstanding,
  currentSourceTrust,
  currentTies,
} from '../src/sim/hf-readings.ts';

function meet() {
  const w = openBuilding(7, 'stairwell@16');
  const r = w.residents.find((p) => p.id === 'hacer')!;
  r.where = 'home';
  w.k.at = 'door:hacer';
  return w;
}
test('face to face player testimony changes HF belief through actual speaker trust', () => {
  const w = meet(),
    engine = buildingEngine(w);
  const before = beliefProbability(engine, 'hacer', 'sevim:nosy');
  expect(currentSourceTrust(engine, 'hacer').kapici).toBeDefined();
  buildingTransaction(w, (candidate) => tellBuilding(candidate, 'hacer', 'sevim:nosy', true, true));
  expect(beliefProbability(buildingEngine(w), 'hacer', 'sevim:nosy')).toBeGreaterThan(before);
  expect(w.residents.find((p) => p.id === 'hacer')!.told).toHaveLength(1);
});
test('remote dialogue refuses without an HF event or resident mutation', () => {
  const w = meet();
  w.k.at = 'shop';
  const before = buildingEngine(w).checkpoint(),
    day = w.residents.find((p) => p.id === 'hacer')!.newsDay;
  buildingTransaction(w, (candidate) => askNewsBuilding(candidate, 'hacer'));
  expect(buildingEngine(w).checkpoint().archive).toEqual(before.archive);
  expect(w.residents.find((p) => p.id === 'hacer')!.newsDay).toBe(day);
  expect(w.said.at(-1)?.text).toContain('meet face to face');
});

test('nosy uses the authored public reputation vocabulary and the actual pleasure rule can earn a treat', () => {
  const w = meet(),
    engine = buildingEngine(w);
  const affection = () => currentTies(engine, 'hacer').find((tie) => tie.otherId === 'sevim')?.affection ?? 0;
  const before = affection();
  buildingTransaction(w, (candidate) => tellBuilding(candidate, 'hacer', 'sevim:nosy', true, true));
  expect(affection()).toBeLessThan(before);
  buildingTransaction(w, (candidate) => tellBuilding(candidate, 'hacer', 'derya:visitor', true, true));
  expect(w.reports[0]?.treats).toContain('a slice of savoury pastry from Ms Hacer');
  expect(w.k.money).toBe(10);
});

test('a resident responds according to their held understanding rather than a host religious ruling', () => {
  const w = meet();
  w.k.at = 'door:burak';
  const engine = buildingEngine(w);
  expect(
    currentNormUnderstanding(engine, 'burak').some(
      (norm) => norm.normId === 'backbiting' && norm.standing === 'forbidden' && norm.conviction >= 0.6,
    ),
  ).toBe(true);
  const affection = () =>
    currentTies(engine, 'burak').find((tie) => tie.otherId === 'kapici')?.affection ?? 0;
  const before = affection();
  buildingTransaction(w, (candidate) => tellBuilding(candidate, 'burak', 'sevim:cruel', true, true));
  expect(affection()).toBeLessThan(before);
  expect(w.said.at(-1)?.text).toMatch(/rather not|private matter|talk about people/);
});
