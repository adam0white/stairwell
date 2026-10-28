import { describe, expect, it, vi } from 'vitest';
import { buildingOffer, buildingSpec, openingPerson } from '../src/sim/hf-authoring.ts';
import { bodyForecastHint, residentHints, wordPrediction } from '../src/sim/hf-hints.ts';
import { BuildingRun } from '../src/sim/hf-run.ts';

function run() {
  return BuildingRun.open(buildingSpec(17), [openingPerson('kapici'), openingPerson('hacer')], {});
}

describe('caretaker hints', () => {
  it('reports unobserved resident knowledge without inventing a judgment', () => {
    const building = run();
    const before = building.checkpoint();
    expect(residentHints(building, 'hacer', 'Hacer')).toEqual({
      warmth: "You don't know how Hacer feels about you.",
      word: "You don't know how much Hacer trusts your word.",
    });
    expect(wordPrediction(building, 'hacer', 'Hacer')).toBe("You don't know whether Hacer will agree.");
    expect(building.checkpoint()).toEqual(before);
  });

  it('uses only the caretaker perspective and preserves known values and missing source entries', () => {
    const inspect = vi.fn(() => ({
      people: [
        {
          kind: 'other',
          parts: [
            {
              select: 'relationships',
              value: { kind: 'known', value: { affection: 0.5 }, evidenceIds: ['seen'] },
            },
            { select: 'sourceTrust', value: { kind: 'prior', value: {}, basis: 'prior' } },
          ],
        },
      ],
    }));
    const building = { inspect } as unknown as BuildingRun<unknown>;
    expect(residentHints(building, 'hacer', 'Hacer')).toEqual({
      warmth: 'Hacer seems fond of you.',
      word: "You don't know how much Hacer trusts your word.",
    });
    expect(inspect).toHaveBeenCalledWith({
      perspective: { kind: 'person', observer: 'kapici' },
      people: ['hacer'],
      select: ['relationships', 'sourceTrust'],
    });
  });

  it('uses a conditional public body forecast without changing the run', () => {
    const building = run();
    const before = building.checkpoint();
    const offer = buildingOffer('kapici', 'stairs', 'climb', 20);
    const line = bodyForecastHint(building, [
      { label: 'stairs', durationMs: offer.durationMs, load: { effort: 0.8, focus: 0, mode: 'awake' } },
    ]);
    expect(line).toMatch(/^If you do this work, you may feel/);
    expect(building.checkpoint()).toEqual(before);
  });
});
