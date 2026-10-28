/** Immutable historical replay dependency boundary. This module never constructs
 * live Stairwell actors. The retained garden artifact keeps its declared HF3 and
 * client0.4.11 peers while the current game chooses its own released runtime.
 */
export {
  exportGardenVisit,
  type GardenVisitSave,
  importGardenVisit,
  replayGardenVisit,
  validateGardenVisitSave,
} from '@adam0white/hearsay-garden-replay';
