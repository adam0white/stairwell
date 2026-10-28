/** Source329919a replay only. This boundary returns detached historical JSON,
 * never a live Person or a legacy faculty API for the current game to mutate.
 */
import { restore, snapshot } from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { restore as restore221, snapshot as snapshot221 } from '@stairwell/hf-221';
import { replay } from './src/sim/game.ts';
import { isSaved } from './src/ui/save.ts';

export const HISTORICAL_SOURCE = '329919ad6308a5cda3596e7bf30729a08f81d463';

export function verifyLegacyRaw(input: unknown): unknown {
  const engine =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as { engine?: unknown }).engine
      : undefined;
  if (engine !== '2.21.0' && engine !== '2.23.0')
    throw new Error('This historical engine has no exact source reader. Keep its source archive.');
  const restored = engine === '2.21.0' ? snapshot221(restore221(input)) : snapshot(restore(input));
  if (canonicalPersona(restored) !== canonicalPersona(input))
    throw new Error('The historical character requires a repair or migration. Keep its source archive.');
  return structuredClone(restored);
}

export function replayLegacyNotebook(input: unknown): { source: string; world: unknown } {
  if (!isSaved(input) || input.castChapter || input.oneCast?.admission)
    throw new Error(
      'This historical source needs its own verified admission recipe. Keep the source archive.',
    );
  // A frozen unowned host prefix is finite evidence, not whole-history conversion.
  // Meaningful one-cast ownership must use its separate historical verifier.
  if (input.oneCast && Object.keys(input.oneCast).some((key) => key !== 'rows'))
    throw new Error('The historical ownership record requires its separate source verifier.');
  if (input.oneCast?.rows.length)
    throw new Error('The historical ownership record is not an unowned source prefix.');
  const world = replay(input.seed, input.inputs, input.minute, input.game);
  return { source: HISTORICAL_SOURCE, world: structuredClone(world) };
}
