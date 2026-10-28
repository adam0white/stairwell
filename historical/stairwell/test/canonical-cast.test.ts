import { seedSourceTrust, seedTie, snapshot } from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import { act, dayStart, newGame, personOf, rOf, tellables } from '../src/sim/game.ts';
import { RESIDENTS, RIDS } from '../src/sim/people.ts';

// Removing canonical actor construction or the trust/repeated-visit discovery gate breaks these controls.
describe('canonical Stairwell edition', () => {
  it('has exactly the five allocated people, with complete stable profiles', () => {
    const s = newGame(11);
    expect(RIDS).toEqual(['hacer', 'sevim', 'burak', 'derya', 'tarik']);
    expect(s.people.map((p) => p.name).sort()).toEqual(['Burak', 'Derya', 'Hacer', 'Sevim', 'Tarık']);
    expect(RESIDENTS.hacer.age).toBe(58);
    for (const id of RIDS) {
      const p = snapshot(personOf(s, id));
      expect(Object.keys(p.traits)).toHaveLength(6);
      expect(Object.keys(p.values)).toHaveLength(10);
      expect(p.traits).toEqual(snapshot(personOf(newGame(91), id)).traits);
      expect(p.values).toEqual(snapshot(personOf(newGame(91), id)).values);
    }
  });

  it('keeps each private discovery behind chosen repeated trusted conversations', () => {
    const facts = {
      hacer: 'hacer:paper_rooms',
      sevim: 'sevim:exercise_books',
      burak: 'burak:paper_mechanisms',
      derya: 'derya:reported_error',
      tarik: 'tarik:bird_recordings',
    } as const;
    for (const [who, fact] of Object.entries(facts)) {
      const id = who as keyof typeof facts;
      const s = newGame(11);
      expect(s.secrets[fact]).toBeUndefined();
      for (const day of [1, 2, 3]) {
        s.minute = dayStart(day) + 17 * 60;
        s.k.at = `door:${id}`;
        s.k.walk = null;
        rOf(s, id).where = 'home';
        const p = personOf(s, id);
        seedSourceTrust(p, 'kapici', 0.9);
        seedTie(p, { otherId: 'kapici', affection: 0.6, familiarity: 0.5, trust: 0.8 });
        act(s, { kind: 'sit', who: id, ...(id === 'derya' ? { topic: 'boundaries' as const } : {}) });
        if (day < 3) expect(s.secrets[fact]).toBeUndefined();
      }
      expect(s.secrets[fact]).toBe(3);
      const choice = tellables(s, id === 'hacer' ? 'burak' : 'hacer').find((x) => x.prop === fact);
      expect(choice?.words).not.toBe(fact);
      expect(choice?.words).toBeTruthy();
      if (id === 'derya') expect(choice?.words).toContain('does not know');
      if (id === 'tarik') expect(choice?.words).toContain('private');
      expect(s.said.some((line) => line.who === id && line.text.length > 80)).toBe(true);
    }
  });
  it('does not trade high credibility for permission to hear a private story', () => {
    const s = newGame(11);
    for (const day of [1, 2, 3]) {
      s.minute = dayStart(day) + 17 * 60;
      s.k.at = 'door:sevim';
      s.k.walk = null;
      rOf(s, 'sevim').where = 'home';
      const p = personOf(s, 'sevim');
      seedSourceTrust(p, 'kapici', 0.95);
      seedTie(p, { otherId: 'kapici', affection: -0.2, familiarity: 0.1, trust: 0.1 });
      act(s, { kind: 'sit', who: 'sevim' });
    }
    expect(s.secrets['sevim:exercise_books']).toBeUndefined();
  });
  it('requires choosing a boundary conversation before Derya gives her work confidence', () => {
    const s = newGame(11);
    for (const day of [1, 2, 3]) {
      s.minute = dayStart(day) + 17 * 60;
      s.k.at = 'door:derya';
      s.k.walk = null;
      rOf(s, 'derya').where = 'home';
      seedTie(personOf(s, 'derya'), { otherId: 'kapici', affection: 0.6, trust: 0.8, familiarity: 0.5 });
      act(s, { kind: 'sit', who: 'derya' });
    }
    expect(s.secrets['derya:reported_error']).toBeUndefined();
  });
});
