import { createRequire } from 'node:module';
import {
  exportGardenVisit,
  importGardenVisit,
  replayGardenVisit,
  validateGardenVisitSave,
} from '@stairwell/garden-replay-history';
import { expect, test } from 'vitest';

/** Installation is part of replay provenance. The garden artifact's exact peers
 * must not be rebound to the current host when its runtime or SDK is upgraded.
 */
test('historical replay keeps its exact runtime and SDK when the modern SDK changes', () => {
  const host = createRequire(import.meta.url);
  const boundary = createRequire(host.resolve('@stairwell/garden-replay-history'));
  const replay = createRequire(boundary.resolve('@adam0white/hearsay-garden-replay'));
  expect(replay('@adam0white/human-framework/package.json').version).toBe('3.0.0');
  expect(replay('@adam0white/lab-client/package.json').version).toBe('0.4.11');
  expect(host('@adam0white/lab-client/package.json').version).not.toBe('0.4.11');
  expect(() => host.resolve('@adam0white/hearsay-garden-replay')).toThrow();
  const gardenSdk = createRequire(replay.resolve('@adam0white/lab-client'));
  expect(gardenSdk('@adam0white/human-framework/package.json').version).toBe('3.0.0');
  const native = createRequire(host.resolve('@stairwell/native-replay-history'));
  const nativeKit = createRequire(native.resolve('@adam0white/lab-kit'));
  expect(native('@adam0white/lab-kit/package.json').version).toBe('0.5.17');
  expect(nativeKit('@adam0white/lab-client/package.json').version).toBe('0.4.15');
  for (const entry of [exportGardenVisit, importGardenVisit, replayGardenVisit, validateGardenVisitSave])
    expect(typeof entry).toBe('function');
});
