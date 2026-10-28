/** Type-only receipt shape from source329919a; historical replay creates no shelf transport. */
import type { PersonaEnvelope } from '@adam0white/lab-client';
import type { Rid } from '../sim/people.ts';
export interface CastReceipts {
  owned: Record<string, PersonaEnvelope>;
  fileOrigin: boolean;
  authored: boolean;
  sources: Partial<Record<Rid, unknown>>;
}
