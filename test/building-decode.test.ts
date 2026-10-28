import { describe, expect, it } from 'vitest';
import { decodeBuildingWorld } from '../src/sim/building-decode.ts';
import { openingWorld } from '../src/sim/hf-world.ts';

describe('native building world decoder', () => {
  for (const edition of ['stairwell@14', 'stairwell@15', 'stairwell@16'] as const) {
    it(`accepts a JSON opening for ${edition}`, () => {
      const value = JSON.parse(JSON.stringify(openingWorld(7, edition)));
      expect(decodeBuildingWorld(value)).toEqual(value);
    });
  }
  it('retains the completion field emitted by an actual monthly meeting', () => {
    const value = openingWorld(7, 'stairwell@15');
    if (!value.month) throw Error('Missing monthly world');
    const completed = { day: 7, yes: 2, no: 3, raise: false, done: true };
    value.month.meetings.push(completed);
    expect(decodeBuildingWorld(value)).toBe(value);
    expect(value.month.meetings[0]).toEqual(completed);
    completed.done = false;
    expect(() => decodeBuildingWorld(value)).toThrow(/keep the original save file/);
  });
  it('refuses malformed values and leaves the original untouched', () => {
    const original = openingWorld(7, 'stairwell@16');
    // biome-ignore lint/suspicious/noExplicitAny: These fixtures deliberately violate the typed host contract.
    const cases: ((w: any) => void)[] = [
      (w) => {
        w.minute = '420';
      },
      (w) => {
        w.residents[0].id = 'unknown';
      },
      (w) => {
        w.tasks[0].place = 'door:unknown';
      },
      (w) => {
        w.tasks[1].id = w.tasks[0].id;
      },
      (w) => {
        w.protocol.phase = 60000;
      },
      (w) => {
        w.protocol.ingresses = [{ phase: 1, minute: 420, inputIds: [] }];
      },
      (w) => {
        w.inputs = [{ at: 420, kind: 'cast-pause', who: 'burak' }];
      },
      (w) => {
        w.inputs = [{ at: 421, kind: 'next' }];
      },
      (w) => {
        w.foreign = true;
      },
      (w) => {
        w.month.rain.started = 1;
      },
      (w) => {
        w.stories.fund.repairAt = NaN;
      },
      (w) => {
        w.protocol.finishedTasks = [{ task: 99999, at: 420, hook: false }];
      },
    ];
    for (const change of cases) {
      const copy = structuredClone(original);
      change(copy);
      expect(() => decodeBuildingWorld(copy)).toThrow(/keep the original save file/);
    }
    const before = JSON.stringify(original);
    expect(decodeBuildingWorld(original)).toBe(original);
    expect(JSON.stringify(original)).toBe(before);
  });
  it('refuses accessors and cycles without executing getters', () => {
    const value = openingWorld(7, 'stairwell@16');
    let read = false;
    Object.defineProperty(value, 'minute', {
      enumerable: true,
      get() {
        read = true;
        return 420;
      },
    });
    expect(() => decodeBuildingWorld(value)).toThrow();
    expect(read).toBe(false);
    const cyclic: Record<string, unknown> = { ...openingWorld(7, 'stairwell@16') };
    cyclic.extra = cyclic;
    expect(() => decodeBuildingWorld(cyclic)).toThrow();
  });
});
