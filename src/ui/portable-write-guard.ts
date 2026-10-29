import { portableWriteBlockers } from '@adam0white/lab-client';
import { RESIDENTS, type Rid } from '../sim/building-cast.ts';

export function requirePortableWrite(id: Rid): void {
  const blocked = portableWriteBlockers(RESIDENTS[id].castId, 'stairwell');
  if (blocked.length)
    throw new Error(
      `This person is read-only until ${blocked.join(', ')} supports safe shared histories. Keep the source chapter.`,
    );
}
