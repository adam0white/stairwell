/** Authored v4 stories. Facts are clues, not reputation traits or progress counters. */
export const STORY_FACTS = {
  hacer: 'hacer:quiet_notice',
  sevim: 'sevim:notice_intent',
  book: 'fund:supplier_credit',
  instalments: 'tarik:repayment_offer',
} as const;

export const STORY_SECRETS = [
  {
    prop: STORY_FACTS.hacer,
    value: true,
    title: 'Hacer wanted the entrance notice to ask for quiet, not explanations.',
  },
  {
    prop: STORY_FACTS.sevim,
    value: true,
    title: 'Sevim meant to clarify the entrance notice, not control visitors.',
  },
  { prop: STORY_FACTS.book, value: true, title: 'The pump supplier will accept the balance next week.' },
  {
    prop: STORY_FACTS.instalments,
    value: true,
    title: 'Tarık offered Burak a private weekly repayment arrangement.',
  },
];

export const STORY_WORDS: Record<string, [string, string]> = {
  [STORY_FACTS.hacer]: [
    'Hacer meant her notice to ask for quiet. She did not mean visitors must explain themselves.',
    'Hacer did not mean the notice as a request for quiet.',
  ],
  [STORY_FACTS.sevim]: [
    'Sevim wanted a clear entrance notice. She did not intend to control visitors.',
    'Sevim did not intend to clarify the notice.',
  ],
  [STORY_FACTS.book]: [
    'The pump supplier will take the balance next week. The book has enough for the deposit.',
    'The pump supplier will not allow a later payment.',
  ],
  [STORY_FACTS.instalments]: [
    'Tarık asks to arrange his dues with you privately, in weekly payments. He asked me to tell you.',
    'Tarık has not offered a repayment arrangement.',
  ],
};

export const STORY_LINES = {
  hacer:
    'I wrote that entrance notice for quiet in the mornings, not a list of everyone’s visitors. Sevim’s correction made it sound like I wanted explanations. Could you ask what she meant?',
  sevim:
    'I wanted a clear notice, not a rule about visitors. I corrected it before asking Hacer what she meant. Perhaps you could ask whether we can rewrite it together.',
  book: 'Come, look at the book. ₺1,800 left; the pump is ₺2,400. The supplier offered a week for the last ₺600. I need a repayment date I can stand behind. No names on the stairs, please.',
  instalments:
    'The pension comes next week. I can clear the dues in weekly payments. Tell Burak that, just Burak. I would rather agree it with him than hide upstairs.',
  agreement:
    'He asked you to tell me? Then I’ll speak with him privately. The supplier can have the deposit from the fund and the balance next week. Keep your own money. I’ll book the engineer.',
  repair:
    'The engineer fitted the new pump. Hot water ran at every tap. Burak entered the deposit and the balance due in the fund book; Tarık’s repayment dates stayed between them.',
  tea: 'On Saturday, Hacer and Sevim rewrote the entrance notice over two cups of tea. Quiet mornings, no explanations demanded. This time each asked what the other meant.',
};

export interface StoryState {
  feud: { hacerPassed: boolean; sevimPassed: boolean; reconciled: boolean };
  fund: {
    bookRead: boolean;
    consentPassed: boolean;
    agreed: boolean;
    repairAt: number | null;
    repaired: boolean;
  };
}

export function newStories(): StoryState {
  return {
    feud: { hacerPassed: false, sevimPassed: false, reconciled: false },
    fund: { bookRead: false, consentPassed: false, agreed: false, repairAt: null, repaired: false },
  };
}

/** Private facts require the resident's chosen confidence in a trusted, repeated sitting. */
export const PRIVATE_FACTS = {
  hacer: 'hacer:paper_rooms',
  sevim: 'sevim:exercise_books',
  burak: 'burak:paper_mechanisms',
  derya: 'derya:reported_error',
  tarik: 'tarik:bird_recordings',
} as const;
export const PRIVATE_LINES = {
  hacer:
    'Could you hold this bit of packaging? I make little paper rooms after tea. That one has a window and no front door. My niece thinks these catalogues are only paperwork. Please let me choose who sees them.',
  sevim:
    'I kept a pupil’s exercise books. I called him lazy before I learned he was caring for a sick parent. I am choosing an example for a lesson, and I keep stopping at his page. That judgment was mine.',
  burak:
    'Hold this harbour fold, please. Pull the tab and the paper ferry crosses it. I learned from a library book when I knew few people. Accounting is still my work; this does not have to be useful.',
  derya:
    'Since you asked about boundaries and training, I can tell you why it is a difficult subject: I reported a scheduling error before anyone was harmed. Training offers stopped afterwards. I kept the correspondence; I do not know whether the two were connected.',
  tarik:
    'Could you help with the player? These tapes are birds from different ferry landings. Some also have my wife’s voice. I choose what we listen to; those voices are not for a public archive. I do not know every bird’s name.',
} as const;
export const PRIVATE_SECRETS = Object.entries(PRIVATE_FACTS).map(([id, prop]) => ({
  prop,
  value: true,
  title: (
    {
      hacer: 'Hacer makes tiny paper rooms.',
      sevim: 'Sevim kept a former pupil’s exercise books.',
      burak: 'Burak makes moving paper models.',
      derya: 'Derya reported an old scheduling error; its career effects are uncertain.',
      tarik: 'Tarık keeps private bird recordings from ferry landings.',
    } as Record<string, string>
  )[id]!,
}));

/** These are reports of a confidence, never permission to publish its private contents. */
export const PRIVATE_WORDS: Record<string, [string, string]> = {
  [PRIVATE_FACTS.hacer]: [
    'Hacer showed me her paper rooms and asked to choose who sees them.',
    'Hacer did not show me paper rooms.',
  ],
  [PRIVATE_FACTS.sevim]: [
    'Sevim told me privately that she once judged a pupil unfairly before learning about his caring duties.',
    'Sevim did not tell me about judging a pupil unfairly.',
  ],
  [PRIVATE_FACTS.burak]: [
    'Burak showed me a moving paper ferry; he makes models in private.',
    'Burak did not show me a paper model.',
  ],
  [PRIVATE_FACTS.derya]: [
    'Derya says she reported an old scheduling error before anyone was harmed. She does not know whether later lost training offers were connected.',
    'Derya did not tell me about an old scheduling error.',
  ],
  [PRIVATE_FACTS.tarik]: [
    'Tarık showed me private bird recordings and asked to keep the incidental voices private.',
    'Tarık did not show me his recordings.',
  ],
};
