import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { act, canReplay, type GameState, replay, rOf, step } from '../src/sim/game.ts';
import { isSaved } from '../src/ui/save.ts';

// Captured from the unchanged simulation before the DL-15 playback changes.
// Hash the entire serialized state, including RNG, memories and pending activity;
// the public fingerprint deliberately summarizes only part of that state.
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/stairwell-v3-notebook.json', import.meta.url), 'utf8'),
);
function stateHash(state: GameState, fixtureEngine: string) {
  const saved = structuredClone(state);
  // HF 2.15.0 changes only Person.engine in these legacy replays. Normalize that
  // stamp to the fixture's HF version; keep every other field and the pinned hashes.
  for (const person of [...saved.people, saved.kapici]) {
    expect(person.engine).toBe('2.14.1');
    person.engine = fixtureEngine;
  }
  return createHash('sha256').update(JSON.stringify(saved)).digest('hex');
}

function restore() {
  const notebook: unknown = fixture.notebook;
  if (!isSaved(notebook)) throw new Error('The frozen notebook must remain importable');
  expect(canReplay(notebook.game)).toBe(true);
  return replay(notebook.seed, notebook.inputs, notebook.minute, notebook.game);
}

describe('pre-playback-change notebook compatibility', () => {
  it('rebuilds the complete frozen state from its seed, inputs and saved minute', () => {
    const state = restore();
    expect(state.minute).toBe(480);
    expect(rOf(state, 'nermin').sits).toBe(1);
    expect(stateHash(state, fixture.humanFramework)).toBe(fixture.savedStateSha256);
  });

  it('continues the restored notebook to the pre-change complete state', () => {
    const state = restore();
    while (state.phase === 'day' && state.minute < fixture.continuation.minute) step(state);
    expect(state.minute).toBe(fixture.continuation.minute);
    expect(stateHash(state, fixture.humanFramework)).toBe(fixture.continuation.stateSha256);
  });
});

// Independently generated public inputs with the action counts documented in
// docs/playtests/owner-2026-10-20.md. No private owner seed or inputs are included.
const ownerStyleFixture = JSON.parse(
  readFileSync(new URL('./fixtures/stairwell-v3-owner-style.json', import.meta.url), 'utf8'),
);

function restoreOwnerStyle() {
  const notebook: unknown = ownerStyleFixture.notebook;
  if (!isSaved(notebook)) throw new Error('The frozen owner-style export must remain importable');
  expect(canReplay(notebook.game)).toBe(true);
  return replay(notebook.seed, notebook.inputs, notebook.minute, notebook.game);
}

describe('frozen owner-style export compatibility', () => {
  it('imports and replays all 130 inputs to the complete first-day state', () => {
    const state = restoreOwnerStyle();
    expect(state.inputs).toHaveLength(130);
    expect(
      state.inputs.reduce<Record<string, number>>((counts, input) => {
        counts[input.kind] = (counts[input.kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ go: 53, tell: 29, invent: 29, news: 7, sit: 6, prank: 5, word: 1 });
    expect(state.minute).toBe(1260);
    expect(state.phase).toBe('night');
    expect(stateHash(state, ownerStyleFixture.humanFramework)).toBe(ownerStyleFixture.savedStateSha256);
  });

  it('continues the imported export into the next day with the complete frozen state', () => {
    const state = restoreOwnerStyle();
    act(state, ownerStyleFixture.continuation.input);
    while (state.phase === 'day' && state.minute < ownerStyleFixture.continuation.minute) step(state);
    expect(state.minute).toBe(1920);
    expect(state.phase).toBe('day');
    expect(stateHash(state, ownerStyleFixture.humanFramework)).toBe(
      ownerStyleFixture.continuation.stateSha256,
    );
  });
});
