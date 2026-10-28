/** Player-facing hints from the caretaker's public perspective. */
import type { BodyForecastLoad, PersonView } from '@stairwell/hf4';
import { KAPICI } from './building-cast.ts';
import type { BuildingRun } from './hf-run.ts';

type OtherPart = Extract<PersonView, { kind: 'other' }>['parts'][number];
type Knowledge<T> = { kind: 'known' | 'prior'; value: T } | { kind: 'unobserved' };
const observed = <T>(reading: Knowledge<T>): T | undefined =>
  reading.kind === 'unobserved' ? undefined : reading.value;

/** What the caretaker knows about a resident's relationship and trust. */
export function residentHints<W>(
  run: BuildingRun<W>,
  person: string,
  name: string,
): { warmth: string; word: string } {
  const view = run.inspect({
    perspective: { kind: 'person', observer: KAPICI },
    people: [person],
    select: ['relationships', 'sourceTrust'],
  }).people[0];
  if (!view || view.kind !== 'other')
    return {
      warmth: `You don't know how ${name} feels about you.`,
      word: `You don't know how much ${name} trusts your word.`,
    };
  const relationship = view.parts.find((part) => part.select === 'relationships')?.value as
    | Extract<OtherPart, { select: 'relationships' }>['value']
    | undefined;
  const sources = view.parts.find((part) => part.select === 'sourceTrust')?.value as
    | Extract<OtherPart, { select: 'sourceTrust' }>['value']
    | undefined;
  const affection = relationship && observed(relationship)?.affection;
  const trust = sources && observed(sources)?.[KAPICI];
  return {
    warmth:
      affection === undefined
        ? `You don't know how ${name} feels about you.`
        : affection > 0.35
          ? `${name} seems fond of you.`
          : affection > 0.12
            ? `${name} seems friendly.`
            : affection > -0.08
              ? `${name} seems polite.`
              : affection > -0.25
                ? `${name} seems distant.`
                : `${name} seems unfriendly.`,
    word:
      trust === undefined
        ? `You don't know how much ${name} trusts your word.`
        : trust >= 0.72
          ? `${name} seems to believe what you say.`
          : trust >= 0.58
            ? `${name} seems to listen to you.`
            : trust >= 0.45
              ? `You aren't sure how much ${name} trusts your word.`
              : `${name} seems to doubt what you say.`,
  };
}

/** Preview currently exposes no public agreement verdict. */
export function wordPrediction<W>(_run: BuildingRun<W>, _person: string, name: string): string {
  return `You don't know whether ${name} will agree.`;
}

/** A conditional forecast for the caretaker, based on HF's declared-load spans. */
export function bodyForecastHint<W>(run: BuildingRun<W>, loads: readonly BodyForecastLoad[]): string {
  const result = run.preview({
    perspective: { kind: 'person', observer: KAPICI },
    person: KAPICI,
    until: run.now,
    inputs: [],
    bodyForecast: loads,
  });
  const spans = result.bodyForecast?.spans;
  if (!spans?.length) return 'You do not know how this work will feel.';
  const worst = spans.reduce((a, b) => (b.worst > a.worst ? b : a));
  const feeling = { fatigue: 'tired', sleepiness: 'sleepy', hunger: 'hungry', thirst: 'thirsty' }[
    worst.worstOf
  ];
  return worst.worst >= 0.7
    ? `If you do this work, you may feel very ${feeling}.`
    : worst.worst >= 0.4
      ? `If you do this work, you may feel ${feeling}.`
      : `If you do this work, you may feel a little ${feeling}.`;
}
