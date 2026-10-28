import { FACTS, RESIDENTS, type Rid } from './building-cast.ts';
import { PRIVATE_WORDS, STORY_WORDS } from './stories.ts';

export const nameOf = (id: string) => (Object.hasOwn(RESIDENTS, id) ? RESIDENTS[id as Rid].name : id);

const TRAIT_WORDS: Record<string, [string, string]> = {
  stingy: ['is unwilling to spend money', 'is willing to spend money'],
  generous: ['is generous', 'is not generous'],
  nosy: ['asks about everyone’s private life', 'respects other people’s privacy'],
  kind: ['is kind', 'is not very kind'],
  cruel: ['can be cruel', 'is not cruel'],
  lazy: ['does nothing all day', 'is not lazy'],
  hardworking: ['works hard', 'does not work much'],
  honest: ['is honest', 'is not honest'],
  dishonest: ['is dishonest with people', 'is honest with people'],
  reliable: ['is reliable', 'is unreliable'],
  unreliable: ['is unreliable', 'is reliable'],
  owes: ['owes money', 'owes nothing'],
};

export function claimWords(prop: string, value: boolean): string {
  const privateWords = Object.hasOwn(PRIVATE_WORDS, prop) ? PRIVATE_WORDS[prop] : undefined;
  if (privateWords) return privateWords[value ? 0 : 1];
  const story = Object.hasOwn(STORY_WORDS, prop) ? STORY_WORDS[prop] : undefined;
  if (story) return story[value ? 0 : 1];
  const [who, trait, other] = prop.split(':');
  if (prop === FACTS.ring)
    return value
      ? 'Burak had a parcel of paper-making supplies.'
      : 'Burak’s parcel contained nothing unusual.';
  if (prop === FACTS.visitor)
    return value ? 'A man comes to Derya’s door late at night.' : 'Nobody comes to Derya’s at night.';
  if (prop === 'derya:brother')
    return value ? 'The man at Derya’s is her brother.' : 'That man is not her brother.';
  if (prop === FACTS.fund)
    return value ? 'The boiler fund has too little money.' : 'The boiler fund has enough money.';
  if (prop === 'notice:water')
    return value ? 'The water will be off on Wednesday from 10:00 to 12:00.' : 'The water is not going off.';
  if (prop === 'hacer:sevim') return 'Hacer and Sevim disagree about a notice.';
  if (who === 'kapici') {
    const w = TRAIT_WORDS[trait ?? '']?.[value ? 0 : 1] ?? trait;
    return `The new caretaker ${w}.`;
  }
  if (trait === 'sweet' && other)
    return value
      ? `${nameOf(who ?? '')} has romantic feelings for ${nameOf(other)}.`
      : `${nameOf(who ?? '')} does not have romantic feelings for ${nameOf(other)}.`;
  if (trait === 'owes')
    return value
      ? `${nameOf(who ?? '')} is late with the building payments.`
      : `${nameOf(who ?? '')} owes nothing.`;
  const w = TRAIT_WORDS[trait ?? '']?.[value ? 0 : 1];
  if (w) return `${nameOf(who ?? '')} ${w}.`;
  return prop;
}
