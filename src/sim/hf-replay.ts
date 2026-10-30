/** Rebuild the complete game through its ordinary input route. Archived initial
 * portable authoring is provenance; this module never grants shelf ownership.
 */

import type { PersonAuthoring } from '@adam0white/human-framework';
import { canonicalPersona, type LifePreparation, validatePortablePerson } from '@adam0white/lab-client';
import type { Rid } from './building-cast.ts';
import { emptyPortableOpening, openingPerson } from './hf-authoring.ts';
import {
  actBuilding,
  advanceBuildingMinute,
  buildingEngine,
  openBuilding,
  restoreBuilding,
} from './hf-game.ts';
import { HF_MINUTE } from './hf-run.ts';
import type { BuildingEdition, BuildingWorld } from './hf-world.ts';

export type OpeningRecipe = {
  format: 'stairwell-opening/1';
  seed: number;
  edition: BuildingEdition;
  arrivals: PersonAuthoring[];
  lifeInputs: LifePreparation[];
};

export function replayBuilding(checkpoint: unknown): BuildingWorld {
  try {
    const source = restoreBuilding(checkpoint);
    const expected = buildingEngine(source).checkpoint();
    const archive = expected.archive;
    const recipe: OpeningRecipe = {
      format: 'stairwell-opening/1',
      seed: source.seed,
      edition: source.version as BuildingEdition,
      lifeInputs: structuredClone(source.nativeLife ?? []),
      arrivals: archive.initial.people.flatMap((person) =>
        person.portable
          ? [
              {
                ...emptyPortableOpening(openingPerson(person.id as Rid)),
                portable: {
                  person: validatePortablePerson(person.portable.person),
                  mapping: structuredClone(person.portable.mapping),
                },
              },
            ]
          : [],
      ),
    };
    const days = archive.initial.spec.definitions.calendar.days;
    const calendarEnd =
      (Math.max(...days.map((day) => day.start)) + archive.initial.spec.definitions.calendar.dayMs) /
      HF_MINUTE;
    if (source.minute >= calendarEnd || source.applied !== source.inputs.length)
      throw new Error('The recorded game exceeds its authored calendar or has unapplied commands.');
    const world = openBuilding(recipe.seed, recipe.edition, recipe.arrivals, recipe.lifeInputs);
    function advanceTo(minute: number): void {
      if (minute < world.minute) throw new Error('A recorded command precedes the current game time.');
      while (world.minute < minute) {
        if (world.phase !== 'day')
          throw new Error('The recorded game needs an actual page-turn command at this boundary.');
        const before = world.minute;
        advanceBuildingMinute(world);
        if (world.minute <= before || world.minute > minute)
          throw new Error('The recorded game cannot reach this command time.');
      }
    }
    for (const input of source.inputs) {
      const { at, ...command } = input;
      advanceTo(at);
      actBuilding(world, command);
    }
    advanceTo(source.minute);
    if (canonicalPersona(buildingEngine(world).checkpoint()) !== canonicalPersona(expected))
      throw new Error('The complete host state or HF archive differs from the recorded game.');
    return world;
  } catch (cause) {
    throw new Error('This notebook cannot be opened by this game version. Start fresh. Keep the file.', {
      cause,
    });
  }
}
