/** Verifies a historical source file before any retained-state projection.
 * The passport's old summary cannot stand in for its omitted memories. Only
 * the raw source whose exact digest was published supplies those memories.
 */
import { canonicalPersona, type PersonaEnvelope } from '@adam0white/lab-client';
import { replayLegacyNotebook, verifyLegacyRaw } from '@stairwell/native-replay-history';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function refuse(): never {
  throw new Error(
    'This character needs its matching source archive. Keep the file; its memories have not been replaced.',
  );
}
async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPersona(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export type VerifiedLegacySource = {
  format: 'stairwell-verified-source/1';
  raw: unknown;
  sha256: string;
  engine: '2.21.0' | '2.23.0';
  personId: string;
  minute: number;
  notebook: 'not-supplied' | 'verified-unowned-native-prefix';
};
export async function verifyLegacySource(
  parent: PersonaEnvelope,
  raw: unknown,
  notebook?: unknown,
): Promise<VerifiedLegacySource> {
  const source = parent.source;
  const transfer = parent.transfer;
  const own =
    source.game === 'stairwell' &&
    ((source.rules === '8' && source.engine === '2.21.0') ||
      (['9', '10', '11'].includes(source.rules) && source.engine === '2.23.0')) &&
    transfer.castPassport === 'stairwell-cast/1';
  const voice =
    source.game === 'voice' &&
    source.rules === 'cast-1' &&
    source.engine === '2.21.0' &&
    parent.castId === 'hf.cast.hacer.voice' &&
    transfer.castPassport === 'site-cast/1';
  if (!own && !voice) refuse();
  const checkpoint = transfer.checkpoint;
  if (
    !object(checkpoint) ||
    Object.keys(checkpoint).sort().join(',') !== 'rng,schema,sha256,sourceMinute' ||
    typeof checkpoint.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(checkpoint.sha256)
  )
    refuse();
  const verified = verifyLegacyRaw(raw);
  if (
    !object(verified) ||
    verified.engine !== source.engine ||
    verified.id !== transfer.sourceRole ||
    verified.schema !== checkpoint.schema ||
    verified.now !== checkpoint.sourceMinute ||
    !Number.isSafeInteger(verified.now) ||
    canonicalPersona(verified.rng) !== canonicalPersona(checkpoint.rng) ||
    (await digest(verified)) !== checkpoint.sha256
  )
    refuse();
  if (notebook !== undefined) {
    if (
      !own ||
      !object(notebook) ||
      notebook.game !== `stairwell@${source.rules}` ||
      notebook.minute !== verified.now
    )
      refuse();
    const replayed = replayLegacyNotebook(notebook).world;
    if (!object(replayed) || !Array.isArray(replayed.people)) refuse();
    const actor = replayed.people.find((person) => object(person) && person.id === verified.id);
    if (canonicalPersona(actor) !== canonicalPersona(verified)) refuse();
  }
  return {
    format: 'stairwell-verified-source/1',
    raw: structuredClone(verified),
    sha256: checkpoint.sha256 as string,
    engine: source.engine as '2.21.0' | '2.23.0',
    personId: verified.id as string,
    minute: verified.now as number,
    notebook: notebook === undefined ? 'not-supplied' : 'verified-unowned-native-prefix',
  };
}
