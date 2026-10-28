/** Player dialogue inside an enclosing building transaction. HF owns its social state. */
import { FACTS, INVENTABLE, KAPICI, RESIDENTS, type Rid } from './building-cast.ts';
import { claimWords, nameOf } from './building-words.ts';
import { applyBuildingEvents, buildingEngine, buildingObservation } from './hf-game.ts';
import {
  beliefProbability,
  currentBody,
  currentNormUnderstanding,
  currentSourceTrust,
  currentTies,
  currentTraits,
} from './hf-readings.ts';
import { storyNewsBuilding, storyTellBuilding } from './hf-stories.ts';
import {
  type BuildingWorld,
  buildingDay,
  buildingPeopleTogether,
  reportBuilding,
  sayBuilding,
  stampBuilding,
} from './hf-world.ts';
import { RELAY_POLICY } from './month.ts';
import { hashUnit } from './rng.ts';

const resident = (w: BuildingWorld, who: Rid) => {
  const r = w.residents.find((p) => p.id === who);
  if (!r) throw Error('Missing building resident.');
  return r;
};
const pick = (w: BuildingWorld, lines: readonly string[]) =>
  lines[Math.floor(hashUnit(w.seed, w.minute, lines.length, w.lineNo) * lines.length)]!;
const affection = (w: BuildingWorld, who: Rid, other: string) =>
  currentTies(buildingEngine(w), who).find((t) => t.otherId === other)?.affection ?? 0;
function canTalk(w: BuildingWorld, who: Rid): boolean {
  if (
    buildingPeopleTogether(w, KAPICI, who) &&
    !currentBody(buildingEngine(w), KAPICI).state.asleep &&
    !currentBody(buildingEngine(w), who).state.asleep
  )
    return true;
  sayBuilding(w, 'narrator', `${nameOf(who)} is not here. You need to meet face to face.`, 'journal');
  return false;
}
function social(w: BuildingWorld, who: Rid, kind: 'conflict' | 'insult' | 'chat', magnitude: number) {
  applyBuildingEvents(w, [
    {
      kind: 'social.received',
      payload: {
        person: who,
        other: KAPICI,
        evidenceId: `stairwell:player-speech:${w.protocol.evidence++}`,
        event: { kind, byMe: false, magnitude },
      },
    },
  ]);
}
export function askNewsBuilding(
  w: BuildingWorld,
  who: Rid,
  promiseDues?: (world: BuildingWorld) => void,
): void {
  if (!canTalk(w, who)) return;
  const r = resident(w, who);
  if (r.newsDay === buildingDay(w)) {
    sayBuilding(w, who, 'You asked me already. Nothing has happened since.', 'voice');
    return;
  }
  r.newsDay = buildingDay(w);
  if (storyNewsBuilding(w, who, promiseDues)) return;
  if (w.lifeNotes?.[who]) sayBuilding(w, who, w.lifeNotes[who]!, 'voice');
  const aff = affection(w, who, KAPICI);
  if (aff < -0.2) {
    sayBuilding(w, who, 'I have no news for you today.', 'voice');
    return;
  }
  const result = applyBuildingEvents(w, [
    {
      kind: 'conversation.requested',
      payload: {
        speaker: who,
        listener: KAPICI,
        topicIds: [],
        maxClaims: aff > 0.25 ? 3 : 2,
        temptations: [],
        loyalWarning: !!w.month,
        ...(w.month ? { confidentMin: RELAY_POLICY[who] } : {}),
      },
    },
  ]);
  const claims = result.events.flatMap((e) =>
    e.data.kind === 'claim-told' && e.data.speaker === who && e.data.listener === KAPICI
      ? [e.data.claim]
      : [],
  );
  if (
    who === 'derya' &&
    !w.derya.told &&
    (currentSourceTrust(buildingEngine(w), who)[KAPICI] ?? 0) >= 0.58 &&
    aff >= 0.15 &&
    w.secrets[FACTS.visitor]
  ) {
    applyBuildingEvents(w, [
      buildingObservation(w, KAPICI, {
        channel: 'told',
        kind: 'fact',
        actorId: who,
        targetId: KAPICI,
        salience: 0.9,
        summary: 'Derya: my brother',
        claims: [{ prop: 'derya:brother', value: true, confidence: 0.95 }],
      }),
    ]);
    w.derya.told = true;
    w.secrets['derya:brother'] = buildingDay(w);
    sayBuilding(
      w,
      who,
      'Do you mean the man who comes at night? That’s Volkan, my brother. He lost his job. Do not tell the other residents. They would gossip about it.',
      'voice',
    );
    stampBuilding(w, 'confided');
    return;
  }
  if (!claims.length) {
    sayBuilding(w, who, 'I have no news for you today.', 'voice');
    return;
  }
  for (const claim of claims) {
    sayBuilding(w, who, claimWords(claim.prop, claim.value), 'voice');
    if (
      [...Object.values(FACTS), 'hacer:nosy', 'tarik:kind', 'derya:brother'].includes(claim.prop) &&
      claim.value &&
      w.secrets[claim.prop] === undefined
    ) {
      w.secrets[claim.prop] = buildingDay(w);
      sayBuilding(w, 'narrator', 'You added a new line to the notebook.', 'event');
    }
  }
}
export function tellBuilding(w: BuildingWorld, who: Rid, prop: string, value: boolean, sure: boolean): void {
  if (!canTalk(w, who)) return;
  if (storyTellBuilding(w, who, prop, value, deliverBuildingClaim)) return;
  const own = beliefProbability(buildingEngine(w), KAPICI, prop),
    side = value ? own : 1 - own;
  deliverBuildingClaim(w, who, prop, value, sure ? 0.95 : Math.max(0.55, Math.min(0.9, side)), side < 0.5);
}
export function inventBuilding(w: BuildingWorld, who: Rid, about: Rid, trait: string): void {
  if (!canTalk(w, who)) return;
  if (about === who) {
    sayBuilding(w, 'narrator', 'You cannot make up a story about someone while speaking to them.', 'journal');
    return;
  }
  if (!(INVENTABLE as readonly string[]).includes(trait) && !trait.startsWith('sweet:')) {
    sayBuilding(w, 'narrator', 'You could not find words for that story.', 'journal');
    return;
  }
  if (trait.startsWith('sweet:')) {
    const other = trait.slice(6) as Rid;
    if (!RESIDENTS[about].single || !RESIDENTS[other]?.single || other === about) {
      sayBuilding(
        w,
        'narrator',
        'Nobody would believe that about a married person. You can only choose people who are single.',
        'journal',
      );
      return;
    }
  }
  const prop = `${about}:${trait}`;
  deliverBuildingClaim(w, who, prop, true, 0.9, beliefProbability(buildingEngine(w), KAPICI, prop) < 0.6);
}
const treats: Record<Rid, string> = {
  hacer: 'a slice of savoury pastry from Ms Hacer',
  sevim: 'two biscuits from Ms Sevim',
  burak: 'a coffee from Burak',
  derya: 'a bag of oranges from Derya',
  tarik: 'a lemon candy from Mr Tarık',
};
const bad = new Set(['stingy', 'nosy', 'cruel', 'lazy', 'dishonest', 'unreliable', 'owes']);
const good = new Set(['generous', 'kind', 'hardworking', 'honest', 'reliable']);
export function deliverBuildingClaim(
  w: BuildingWorld,
  who: Rid,
  prop: string,
  value: boolean,
  conf: number,
  lie: boolean,
): void {
  const engine = buildingEngine(w),
    r = resident(w, who),
    before = beliefProbability(engine, who, prop);
  applyBuildingEvents(w, [
    buildingObservation(w, who, {
      channel: 'told',
      kind: 'gossip',
      actorId: KAPICI,
      targetId: who,
      salience: 0.75,
      summary: claimWords(prop, value),
      claims: [{ prop, value, confidence: conf }],
    }),
  ]);
  const after = beliefProbability(engine, who, prop);
  r.told.push({ prop, value, at: w.minute, lie });
  if (w.month)
    w.month.testimony.push({
      from: KAPICI,
      to: who,
      prop,
      value,
      at: w.minute,
      caretaker: { at: w.minute, lie },
    });
  else if (r.told.length > 40) r.told.splice(0, r.told.length - 40);
  const [subject = '', trait = ''] = prop.split(':');
  const person = subject in RESIDENTS,
    unfav = bad.has(trait) ? value : good.has(trait) ? !value : false;
  const feel = person ? affection(w, who, subject) : 0;
  const holds = currentNormUnderstanding(engine, who).some(
    (n) => n.normId === 'backbiting' && n.standing === 'forbidden' && n.conviction >= 0.6,
  );
  const moved = (after - before) * (value ? 1 : -1),
    already = (value ? before : 1 - before) >= 0.75;
  let line: string,
    pleasure = 0;
  if (already)
    line = pick(w, ['Everybody knows that.', 'That is old news, my child.', 'I know that already.']);
  else if (unfav && person && holds) {
    line = pick(w, [
      'I would rather not hear that.',
      'That is a private matter.',
      'Let’s not talk about people.',
    ]);
    social(w, who, 'conflict', 0.1);
  } else if (unfav && person && feel > 0.35) {
    line = pick(w, [
      `Don’t talk like that about ${nameOf(subject)}.`,
      `Are you talking about ${nameOf(subject)}? No, I do not believe it.`,
    ]);
    social(w, who, 'insult', 0.2);
  } else if (moved < 0.03)
    line = pick(w, [
      'Who told you that?',
      'I am not sure about that.',
      'I will believe it when I see it myself.',
    ]);
  else if (unfav && person && feel < 0) {
    line = pick(w, [
      'I knew it. Have I not always said that?',
      'Of course that is true.',
      'Ha! Come in for a minute and tell me more.',
    ]);
    pleasure = moved * (0.5 - feel) * 2;
  } else if (!unfav && person && feel > 0.2) {
    line = pick(w, ['That’s nice to hear.', 'That is good. I am happy to hear it.']);
    pleasure = moved * feel;
  } else if (prop === FACTS.ring || prop.includes(':sweet:') || prop === FACTS.visitor) {
    line = pick(w, [
      'Is that really true?',
      'Well! I would never have expected that.',
      'Tell me everything.',
    ]);
    pleasure = moved * (0.3 + currentTraits(engine, who).openness);
  } else line = pick(w, ['Is that so?', 'I am thinking about that.', 'That is interesting.']);
  sayBuilding(w, who, line, 'voice');
  if (pleasure > 0.04) {
    social(w, who, 'chat', Math.min(0.6, pleasure * 4));
    if (r.treatDay !== buildingDay(w) && pleasure > 0.08) {
      r.treatDay = buildingDay(w);
      const treat = treats[who];
      reportBuilding(w).treats.push(treat);
      if (who !== 'tarik' && who !== 'burak') {
        w.k.money += 10;
        reportBuilding(w).tips += 10;
      }
      sayBuilding(w, 'narrator', `${nameOf(who)} gave you ${treat.replace(/ from .*/, '')}.`, 'event');
      stampBuilding(w, 'treat');
    }
  }
  if (prop === FACTS.ring && who === 'hacer') w.ring.spoiled = after >= 0.7;
}
