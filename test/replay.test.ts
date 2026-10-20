import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canReplay, type GameState, replay, rOf, step } from '../src/sim/game.ts';
import { isSaved } from '../src/ui/save.ts';

// Captured from the unchanged simulation before the DL-15 playback changes.
// Hash the entire serialized state, including RNG, memories and pending activity;
// the public fingerprint deliberately summarizes only part of that state.
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/stairwell-v3-notebook.json', import.meta.url), 'utf8'),
);
const stateHash = (state: GameState) => createHash('sha256').update(JSON.stringify(state)).digest('hex');

function restore() {
  const notebook: unknown = fixture.notebook;
  if (!isSaved(notebook)) throw new Error('The frozen notebook must remain importable');
  expect(canReplay(notebook.game)).toBe(true);
  return replay(notebook.seed, notebook.inputs, notebook.minute);
}

describe('pre-playback-change notebook compatibility', () => {
  it('rebuilds the complete frozen state from its seed, inputs and saved minute', () => {
    const state = restore();
    expect(state.minute).toBe(480);
    expect(rOf(state, 'nermin').sits).toBe(1);
    expect(stateHash(state)).toBe(fixture.savedStateSha256);
  });

  it('continues the restored notebook to the pre-change complete state', () => {
    const state = restore();
    while (state.phase === 'day' && state.minute < fixture.continuation.minute) step(state);
    expect(state.minute).toBe(fixture.continuation.minute);
    expect(stateHash(state)).toBe(fixture.continuation.stateSha256);
  });
});
