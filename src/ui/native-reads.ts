/** Player-facing readings use only the caretaker's public perspective. */
import { KAPICI, type Rid } from '../sim/building-cast.ts';
import type { Place } from '../sim/building-types.ts';
import { claimWords, nameOf } from '../sim/building-words.ts';
import { buildingEngine, buildingFloor, buildingTravelMinutes } from '../sim/hf-game.ts';
import { bodyForecastHint, residentHints, wordPrediction } from '../sim/hf-hints.ts';
import { HF_MINUTE } from '../sim/hf-run.ts';
import { type BuildingWorld, buildingDay } from '../sim/hf-world.ts';

export type NativeProjection = {
  reads: Record<Rid, { warmth: string; word: string }>;
  words: Record<Rid, string>;
  tell: Record<Rid, Tellable[]>;
  legs: Record<string, string>;
  travel: Record<string, number>;
  bins: Record<string, string>;
};
const projections = new WeakMap<BuildingWorld, NativeProjection>();
export function installNativeProjection(world: BuildingWorld, projection: NativeProjection) {
  projections.set(world, projection);
}
export function projectedTravel(world: BuildingWorld, from: Place, to: Place): number {
  const value = projections.get(world);
  if (value) {
    const minutes = value.travel[`${from}|${to}`];
    if (minutes === undefined) throw Error('Missing route projection.');
    return minutes;
  }
  return buildingTravelMinutes(world, from, to);
}
export function projectedBins(world: BuildingWorld, to: Place): string {
  const value = projections.get(world);
  if (!value) throw Error('Missing bins projection.');
  return value.bins[to] ?? '';
}
export function readOf(world: BuildingWorld, id: Rid): { warmth: string; word: string } {
  const projected = projections.get(world);
  if (projected) return projected.reads[id];
  return residentHints(buildingEngine(world), id, nameOf(id));
}

export function wordHint(world: BuildingWorld, id: Rid): string {
  const projected = projections.get(world);
  if (projected) return projected.words[id];
  const day = buildingDay(world);
  const weekday = world.month ? ((day - 1) % 7) + 1 : day;
  if (weekday < 4) return 'Ask from Thursday at 07:00, face to face.';
  return wordPrediction(buildingEngine(world), id, nameOf(id));
}

const routeForecasts = new WeakMap<BuildingWorld, { at: number; from: Place; to: Place; text: string }>();
export function legsLine(world: BuildingWorld, to: Place): string {
  const projected = projections.get(world);
  if (projected)
    return (
      projected.legs[to] ??
      (buildingFloor(to) - buildingFloor(world.k.at) < 2 ? '' : 'Checking how this work may feel…')
    );
  if (buildingFloor(to) - buildingFloor(world.k.at) < 2) return '';
  const engine = buildingEngine(world),
    cached = routeForecasts.get(world);
  if (cached?.at === engine.now && cached.from === world.k.at && cached.to === to) return cached.text;
  const duration = buildingTravelMinutes(world, world.k.at, to);
  const text = bodyForecastHint(engine, [
    { label: 'climb', durationMs: duration * HF_MINUTE, load: { effort: 0.85, focus: 0, mode: 'awake' } },
    {
      label: 'the next errands',
      durationMs: 120 * HF_MINUTE,
      load: { effort: 0.5, focus: 0, mode: 'awake' },
    },
  ]);
  routeForecasts.set(world, { at: engine.now, from: world.k.at, to, text });
  return text;
}

export interface Tellable {
  prop: string;
  value: boolean;
  sure: 'sure' | 'heard' | 'doubt';
  words: string;
}

export function tellables(world: BuildingWorld, to: Rid): Tellable[] {
  const projected = projections.get(world);
  if (projected) return projected.tell[to];
  const view = buildingEngine(world).inspect({
    perspective: { kind: 'person', observer: KAPICI },
    people: [KAPICI],
    select: ['beliefs'],
  }).people[0];
  if (view?.kind !== 'self') return [];
  const beliefs = view.parts.find((part) => part.select === 'beliefs')?.value ?? [];
  const recipient = world.residents.find((resident) => resident.id === to);
  const out: Tellable[] = [];
  for (const belief of beliefs) {
    const prop = belief.prop;
    if (
      prop.split(':')[0] === to ||
      prop.startsWith('advice:') ||
      prop.includes(':should:') ||
      prop.startsWith('kapici:')
    )
      continue;
    if (prop === 'notice:water' && (world.minute >= 2 * 1440 + 600 || to === 'burak')) continue;
    const c = belief.credence;
    if (Math.abs(c - 0.5) < 0.1) continue;
    const value = c > 0.5;
    if (belief.sources.some((source) => source.id === to && source.value === value)) continue;
    if (recipient?.told.some((told) => told.prop === prop && told.value === value)) continue;
    const side = value ? c : 1 - c;
    out.push({
      prop,
      value,
      sure: side >= 0.8 ? 'sure' : side >= 0.65 ? 'heard' : 'doubt',
      words: claimWords(prop, value),
    });
  }
  return out.sort((a, b) => (a.prop < b.prop ? -1 : a.prop > b.prop ? 1 : 0));
}

export function hasNativeForecast(world: BuildingWorld, to: Place): boolean {
  return projections.get(world)?.legs[to] !== undefined;
}
