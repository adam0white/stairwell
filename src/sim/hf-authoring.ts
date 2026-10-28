/** The building's authored opening, definitions and source identities. These are
 * fictional premises, not runtime setters or copies of HF physiology/reputation.
 */

import { canonicalCast } from '@adam0white/lab-client';
import { DEFAULT_NORMS, type Offer, type PersonAuthoring, type RunSpec } from '@stairwell/hf4';
import { FACTS, KAPICI, RESIDENTS, RIDS, type Rid } from './building-cast.ts';
import { atMinute, HF_MINUTE } from './hf-run.ts';
export const OPENING = atMinute(420);
const DAY = 1440 * HF_MINUTE;
const ACTIONS = [
  'wait',
  'rest',
  'work',
  'eat',
  'drink',
  'sleep',
  'walk',
  'climb',
  'sit',
  'visit',
  'help',
  'talk',
  'tea',
  'shop',
  'peek',
  'arrange-parcel',
  'ask-private-help',
  'ask-seating',
  'arrange-private-payment',
  'handover-parcel',
  'pay-dues',
  'pray',
  'pray-home',
  'pray-qada',
  'pray-eid',
];
export function buildingSpec(seed: number, edition = 'stairwell@14'): RunSpec {
  return {
    id: `stairwell:${edition}:${seed}`,
    seed,
    start: OPENING,
    host: { id: 'stairwell', edition, schema: 'stairwell-world/1' },
    definitions: {
      actions: ACTIONS.map((id) => ({
        id,
        label: id,
        demands: { effort: 0.05, focus: 0, mode: id === 'sleep' ? 'sleep' : 'awake', requires: {} },
        tags: id === 'rest' ? ['rest'] : [],
        norms: id.startsWith('pray')
          ? [{ normId: id === 'pray-eid' ? 'eid-prayer' : 'salah', relation: 'fulfills' }]
          : [],
      })),
      norms: structuredClone(DEFAULT_NORMS),
      marriageCustoms: [],
      skills: [],
      skillTransfers: [],
      methods: [],
      routines: [],
      sources: [
        { type: 'host', id: 'stairwell' },
        { type: 'voice', id: 'player' },
        ...[KAPICI, ...RIDS].map((id) => ({ type: 'person' as const, id })),
      ],
      lexicon: {
        names: Object.fromEntries([[KAPICI, 'Kapıcı'], ...RIDS.map((id) => [id, RESIDENTS[id].name])]),
        roles: {},
        prefer: 'name',
        actions: {},
      },
      calendar: {
        id: 'stairwell-calendar/1',
        epoch: { id: 'stairwell-midnight', simulationAt: 0, dayIndex: 0, msOfDay: 0 },
        dayMs: 86400000,
        days: Array.from({ length: 29 }, (_, dayIndex) => ({ dayIndex, start: dayIndex * DAY, windows: [] })),
      },
    },
    lifecycle: { kinPremises: [], kinScopes: [] },
    world: { revision: 0, facts: [], hostState: null },
  };
}
function belief(
  person: string,
  prop: string,
  credence: number,
  value = true,
): PersonAuthoring['state']['beliefs'][number] {
  return {
    prop,
    logOdds: Math.log(credence / (1 - credence)) * (value ? 1 : -1),
    updatedAt: OPENING,
    sources: [{ id: person, value }],
  };
}
export function openingPerson(id: Rid | typeof KAPICI): PersonAuthoring {
  const resident = id === KAPICI ? undefined : RESIDENTS[id as Rid];
  const canonical = resident ? canonicalCast(resident.castId) : undefined;
  const sex = id === 'burak' || id === 'tarik' || id === KAPICI ? 'male' : 'female';
  const traits = canonical?.traits ?? {
    honesty: 0.6,
    emotionality: 0.5,
    extraversion: 0.5,
    agreeableness: 0.5,
    conscientiousness: 0.5,
    openness: 0.5,
  };
  const values = canonical?.values ?? {
    benevolence: 0.5,
    universalism: 0.5,
    tradition: 0.5,
    conformity: 0.5,
    security: 0.5,
    achievement: 0.5,
    power: 0.5,
    hedonism: 0.5,
    stimulation: 0.5,
    selfDirection: 0.5,
  };
  const held: PersonAuthoring['state']['heldNorms'][number][] = [];
  const understand = (
    normId: string,
    standing: PersonAuthoring['state']['heldNorms'][number]['standing'],
    conviction: number,
  ) => {
    const norm = DEFAULT_NORMS.find((n) => n.id === normId);
    if (!norm) throw new Error(`Missing sourced norm ${normId}`);
    held.push({ normId, standing, conviction, provenance: structuredClone(norm.provenance) });
  };
  if (id === 'hacer') understand('backbiting', 'disliked', 0.15);
  if (id === 'sevim') understand('backbiting', 'disliked', 0.4);
  if (id === 'burak') {
    understand('backbiting', 'forbidden', 0.6);
    understand('lying', 'forbidden', 0.8);
  }
  if (id === 'derya') understand('backbiting', 'forbidden', 0.5);
  if (id === 'tarik') understand('backbiting', 'forbidden', 0.7);
  const person: PersonAuthoring = {
    id,
    identity: {
      name: resident?.name ?? 'Kapıcı',
      birthAt: OPENING - (resident?.age ?? 38) * 365 * DAY,
      sex,
      ...(resident ? { castId: resident.castId } : {}),
    },
    biography: [],
    origin: {
      kind: 'authored',
      basis: { kind: 'evidence', id: `stairwell:author:${id}` },
      traits: { kind: 'explicit-authoring', evidence: { kind: 'evidence', id: `stairwell:traits:${id}` } },
    },
    state: {
      traits: structuredClone(traits),
      values: structuredClone(values),
      // Fresh people have eaten breakfast before the opening. Portable arrivals
      // overwrite these authored resources through HF and are never fed to fit.
      body: {
        satiety: 1,
        hydration: 1,
        sleepPressure: 0.2,
        exertion: 0,
        fitness: 0.5,
        health: 1,
        pain: 0,
        sleepDebtHours: 0,
        depletion: 0,
        circadianPeakMs: atMinute(960),
        asleep: false,
        since: OPENING,
        doze: {
          context: { posture: 'upright', stimulation: 0.5 },
          basis: { kind: 'authored', author: 'stairwell', at: OPENING },
        },
        bladder: { fill: 0, pending: 0 },
        injuries: [],
        illnesses: [],
        exposures: [],
      },
      needs: {
        safety: 0.8,
        belonging: 0.7,
        esteem: 0.6,
        autonomy: 0.7,
        competence: 0.6,
        leisure: 0.6,
        meaning: 0.6,
      },
      skills: [],
      heldNorms: held,
      beliefs: [],
      consequences: [],
      sourceTrust: [],
      context: {
        scarcity: { kind: 'prior', value: 0, basis: 'stairwell:opening-resources' },
        smoking: { kind: 'unobserved' },
      },
      relationships: [],
      voices: id === KAPICI ? [] : [{ voiceId: KAPICI, trust: 0.5 }],
      agenda: {
        exemptions: { traveling: { kind: 'unobserved' }, illnessSeverity: { kind: 'unobserved' } },
        commitments: [],
        goals: [],
        precommitments: [],
        owed: [],
      },
      family: { contactCovered: [], aptitudes: {} },
      groups: [],
      reserve: {},
      retention: { trace: 32, chronicleDays: 120 },
      habits: [],
      expectations: [],
      affect: { mood: { valence: 0, arousal: 0.3 }, regulation: 0.3, emotions: [] },
      promptings: { reading: 'none', responses: [] },
      review: { style: 'accounting', atMsOfDay: atMinute(1260) },
      bonds: { courtships: [], marriages: [] },
    },
  };
  if (id === KAPICI) {
    person.state.beliefs = [
      belief(id, 'hacer:nosy', 0.8),
      belief(id, 'tarik:kind', 0.85),
      belief(id, 'notice:water', 0.95),
    ];
    person.state.sourceTrust = RIDS.map((sourceId) => ({ sourceId, trust: 0.6 }));
  } else {
    const years: Record<Rid, number> = { hacer: 0.1, sevim: 30, burak: 3, derya: 8, tarik: 45 };
    person.state.relationships = RIDS.filter((other) => other !== id).map((other) => {
      const familiarity = Math.min(0.9, Math.min(years[id as Rid], years[other]) / 30);
      return {
        otherId: other,
        affection: 0.15 + 0.2 * familiarity,
        familiarity,
        trust: 0.45 + 0.3 * familiarity,
        respect: 0,
        roles: [],
        ledger: 0,
        lastInteraction: OPENING,
      };
    });
    person.state.sourceTrust = RIDS.filter((other) => other !== id).map((sourceId) => ({
      sourceId,
      trust: Math.min(0.8, 0.5 + 0.3 * Math.min(0.9, Math.min(years[id as Rid], years[sourceId]) / 30)),
    }));
    const word: Record<Rid, number> = { hacer: 0.73, sevim: 0.48, burak: 0.55, derya: 0.52, tarik: 0.6 };
    person.state.sourceTrust = [...person.state.sourceTrust, { sourceId: KAPICI, trust: word[id as Rid] }];
    person.state.relationships = [
      ...person.state.relationships,
      {
        otherId: KAPICI,
        affection: 0.05,
        familiarity: 0.02,
        trust: 0.5,
        respect: 0,
        roles: [],
        ledger: 0,
        lastInteraction: OPENING,
      },
    ];
    if (id === 'burak')
      person.state.beliefs = [belief(id, FACTS.dues, 0.97), belief(id, 'notice:water', 0.97)];
    if (id !== 'tarik') person.state.beliefs = [...person.state.beliefs, belief(id, 'tarik:kind', 0.8)];
  }
  return person;
}
export function buildingOffer(
  person: string,
  id: string,
  actionId: string,
  minutes: number,
  options: Partial<Offer> = {},
): Offer {
  return {
    id,
    person,
    actionId,
    label: id,
    durationMs: atMinute(minutes),
    demands: { effort: 0.05, focus: 0, mode: 'awake', requires: {} },
    tags: [],
    norms: [],
    expected: { needs: {}, followedBy: [], provenance: [] },
    participants: [],
    alongside: [],
    fulfills: [],
    advances: [],
    diminishes: [],
    ...options,
  };
}
