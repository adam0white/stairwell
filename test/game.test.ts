import { describe, expect, it } from 'vitest';
import { playWeek } from '../scripts/policy.ts';
import { act, fingerprint, newGame, replay, rOf, step, tellables } from '../src/sim/game.ts';
import { RIDS } from '../src/sim/people.ts';

describe('The Stairwell', () => {
  it('a week completes and the meeting votes', () => {
    const s = playWeek(7, 'honest');
    expect(s.phase).toBe('end');
    expect(s.meeting).toBeTruthy();
    for (const id of RIDS) expect(['yes', 'no', 'away']).toContain(rOf(s, id).vote);
  });

  it('replays exactly from seed and inputs', () => {
    for (const style of ['quiet', 'gossip', 'liar'] as const) {
      const s = playWeek(11, style);
      expect(fingerprint(replay(s.seed, s.inputs))).toBe(fingerprint(s));
    }
  });

  it('honest service earns more hands than lying', () => {
    let honest = 0;
    let liar = 0;
    for (const seed of [1, 2, 3]) {
      honest += playWeek(seed, 'honest').meeting?.yes ?? 0;
      liar += playWeek(seed, 'liar').meeting?.yes ?? 0;
    }
    expect(honest).toBeGreaterThan(liar);
  });

  it('a lie told to two feuding neighbours can be caught', () => {
    const s = playWeek(3, 'liar');
    const caught = s.residents.reduce((a, r) => a + r.caught.length + r.grudges.length, 0);
    expect(caught).toBeGreaterThan(0);
  });

  it('the notebook starts with things to tell', () => {
    const s = newGame(5);
    for (let i = 0; i < 5; i++) step(s);
    expect(tellables(s, 'nermin').length).toBeGreaterThan(0);
    act(s, { kind: 'go', to: 'bakery' });
    expect(s.inputs.length).toBe(1);
  });
});
