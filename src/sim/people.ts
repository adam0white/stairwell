/**
 * The residents of Lale Apartmanı and the kapıcı, as HF people. Who they are lives in each PersonSpec, a few seeded
 * ties and beliefs, and their trust in the new kapıcı's word. The game reads them back through HF (converse, perceive,
 * credence, decide, predict) and keeps no parallel model of their minds.
 *
 * Source trust (how much a person believes what someone tells them) is authored through HF's `seedSourceTrust`.
 * Legacy self-source beliefs remain for stairwell@3 replay compatibility (docs/hf-requests.md, 7).
 */

import {
  createPerson,
  MINUTES_PER_YEAR,
  type Person,
  REPUTATION_TRAITS,
  seedSourceTrust,
  seedTie,
  type TraitEffect,
} from '@adam0white/human-framework';
import { canonicalCast } from '@adam0white/lab-client';

import { FACTS, KAPICI, RESIDENTS, RIDS, type Rid } from './building-cast.ts';

export {
  FACTS,
  INVENTABLE,
  type Inventable,
  KAPICI,
  RESIDENTS,
  type ResidentInfo,
  RIDS,
  type Rid,
} from './building-cast.ts';

/** The building's character vocabulary: HF's reputation traits plus two of its own. */
export const TRAITS: Record<string, TraitEffect> = {
  ...REPUTATION_TRAITS,
  nosy: { affection: -0.03, trust: -0.03, respect: -0.03 },
  /** '<a>:sweet:<b>': talk about who likes whom. Neutral to the subject's standing. */
  sweet: { affection: 0, trust: 0, respect: 0 },
};

const yearsAgo = (now: number, y: number) => now - y * MINUTES_PER_YEAR;

/** Legacy v3 setup: HF seedBelief rejects these self-source observation markers. */
function seedBelief(p: Person, prop: string, value: boolean, cred: number, now: number) {
  const logOdds = Math.log(cred / (1 - cred)) * (value ? 1 : -1);
  p.memory.beliefs.push({ prop, logOdds, updatedAt: now, sources: [{ id: p.id, value }] });
}

export function makeResident(id: Rid, seed: number, now: number): Person {
  const r = RESIDENTS[id];
  const base = {
    id,
    lexicon: { plainEnglish: true },
    name: r.name,
    now,
    bornAt: yearsAgo(now, r.age),
    voices: [{ voiceId: KAPICI, trust: 0.5 }],
  };
  let p: Person;
  switch (id) {
    case 'hacer':
      p = createPerson({
        ...base,
        seed: seed ^ 0x11,
        sex: 'female',
        traits: {
          honesty: 0.5,
          extraversion: 0.8,
          agreeableness: 0.45,
          emotionality: 0.6,
          conscientiousness: 0.5,
          openness: 0.5,
        },
        norms: [{ normId: 'backbiting', standing: 'disliked', conviction: 0.15 }],
      });
      break;
    case 'sevim':
      p = createPerson({
        ...base,
        seed: seed ^ 0x22,
        sex: 'female',
        traits: {
          honesty: 0.6,
          extraversion: 0.6,
          agreeableness: 0.35,
          conscientiousness: 0.85,
          openness: 0.4,
          emotionality: 0.5,
        },
        norms: [{ normId: 'backbiting', standing: 'disliked', conviction: 0.4 }],
      });
      break;
    case 'burak':
      p = createPerson({
        ...base,
        seed: seed ^ 0x33,
        sex: 'male',
        traits: {
          honesty: 0.8,
          extraversion: 0.3,
          agreeableness: 0.7,
          conscientiousness: 0.8,
          openness: 0.5,
          emotionality: 0.5,
        },
        norms: [
          { normId: 'backbiting', standing: 'forbidden', conviction: 0.6 },
          { normId: 'lying', standing: 'forbidden', conviction: 0.8 },
        ],
      });
      break;
    case 'derya':
      p = createPerson({
        ...base,
        seed: seed ^ 0x55,
        sex: 'female',
        traits: {
          honesty: 0.7,
          extraversion: 0.35,
          agreeableness: 0.6,
          emotionality: 0.5,
          openness: 0.55,
          conscientiousness: 0.5,
        },
        norms: [{ normId: 'backbiting', standing: 'forbidden', conviction: 0.5 }],
      });
      break;
    default:
      p = createPerson({
        ...base,
        seed: seed ^ 0x77,
        sex: 'male',
        traits: {
          honesty: 0.8,
          extraversion: 0.5,
          agreeableness: 0.7,
          conscientiousness: 0.6,
          emotionality: 0.4,
          openness: 0.5,
        },
        norms: [{ normId: 'backbiting', standing: 'forbidden', conviction: 0.7 }],
      });
  }

  p.traits = structuredClone(canonicalCast(r.castId).traits);
  p.values = structuredClone(canonicalCast(r.castId).values);
  seedNeighbours(p, now);
  return p;
}

/** Years of living on the same stairs: ties, who believes whom, and what each already thinks. */
function seedNeighbours(p: Person, now: number) {
  const id = p.id as Rid;
  const years: Record<Rid, number> = {
    hacer: 0.1,
    sevim: 30,
    burak: 3,
    derya: 8,
    tarik: 45,
  };
  for (const o of RIDS) {
    if (o === id) continue;
    const known = Math.min(years[id], years[o]);
    const familiarity = Math.min(0.9, known / 30);
    const affection = 0.15 + 0.2 * familiarity;
    seedTie(p, { otherId: o, affection, familiarity, trust: 0.45 + 0.3 * familiarity });
    // Neighbours of many years believe each other more; the newcomer's word weighs little yet.
    seedSourceTrust(p, o, Math.min(0.8, 0.5 + 0.3 * familiarity));
  }
  // Burak holds the private building account. Shared observations do not reveal hobbies.

  if (id === 'burak') {
    seedBelief(p, FACTS.dues, true, 0.97, now);
    seedBelief(p, 'notice:water', true, 0.97, now);
  }
  if (id !== 'tarik') seedBelief(p, 'tarik:kind', true, 0.8, now);
  // The new kapıcı: a stranger whose word weighs little. Hacer likes a new face; Sevim reserves judgement.
  const word: Record<Rid, number> = {
    hacer: 0.73,
    sevim: 0.48,
    burak: 0.55,
    derya: 0.52,
    tarik: 0.6,
  };
  seedSourceTrust(p, KAPICI, word[id]);
  seedTie(p, { otherId: KAPICI, affection: 0.05, familiarity: 0.02, trust: 0.5 });
}

/** The kapıcı: an HF person for the body (stairs and legs) and the notebook (what he believes, from whom). */
export function makeKapici(seed: number, now: number): Person {
  const p = createPerson({
    id: KAPICI,
    lexicon: { plainEnglish: true },
    name: 'Kapıcı',
    now,
    seed: seed ^ 0x99,
    bornAt: yearsAgo(now, 38),
    sex: 'male',
    traits: { honesty: 0.6, extraversion: 0.5 },
    enable: { fatigueStore: true },
  });
  // The former caretaker’s notebook includes only ordinary observations.
  seedBelief(p, 'hacer:nosy', true, 0.8, now);
  seedBelief(p, 'tarik:kind', true, 0.85, now);
  // Burak Bey's notice on the board by your door: the water goes off on Wednesday morning.
  seedBelief(p, 'notice:water', true, 0.95, now);
  for (const r of RIDS) seedSourceTrust(p, r, 0.6);
  return p;
}
