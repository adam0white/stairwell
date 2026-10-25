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
    title:
      'Hacer wanted the entrance notice to ask for quiet. She did not want visitors to explain themselves.',
  },
  {
    prop: STORY_FACTS.sevim,
    value: true,
    title: 'Sevim meant to make the entrance notice clearer. She did not want to control visitors.',
  },
  {
    prop: STORY_FACTS.book,
    value: true,
    title: 'The pump supplier will accept the remaining payment next week.',
  },
  {
    prop: STORY_FACTS.instalments,
    value: true,
    title: 'Tarık offered to repay Burak in weekly payments. He wanted to arrange this privately.',
  },
];

export const STORY_WORDS: Record<string, [string, string]> = {
  [STORY_FACTS.hacer]: [
    'Hacer meant her notice to ask for quiet. She did not mean visitors must explain themselves.',
    'Hacer did not mean the notice as a request for quiet.',
  ],
  [STORY_FACTS.sevim]: [
    'Sevim wanted an entrance notice that was easy to understand. She did not intend to control visitors.',
    'Sevim did not intend to make the notice clearer.',
  ],
  [STORY_FACTS.book]: [
    'The pump supplier will take the remaining payment next week. The building fund has enough for the first payment.',
    'The pump supplier will not allow a later payment.',
  ],
  [STORY_FACTS.instalments]: [
    'Tarık asks to arrange his building payments with you privately. He wants to pay weekly. He asked me to tell you.',
    'Tarık has not offered to arrange repayments.',
  ],
};

export const STORY_LINES = {
  hacer:
    'I wrote that entrance notice to ask for quiet in the mornings. I did not want a list of everyone’s visitors. Sevim’s correction made it sound like I wanted explanations. Could you ask what she meant?',
  sevim:
    'I wanted a notice that was easy to understand. I did not want a rule about visitors. I corrected it before asking Hacer what she meant. Perhaps you could ask whether we can rewrite it together.',
  book: 'Come and look at the book. We have ₺1,800 left, and the pump costs ₺2,400. The supplier gave us a week to pay the last ₺600. I need a repayment date I can be sure of. Please do not name anyone when you talk on the stairs.',
  instalments:
    'My pension comes next week. I can pay what I owe in weekly payments. Tell Burak that. Tell only Burak. I would rather agree on this with him than hide upstairs.',
  agreement:
    'He asked you to tell me? Then I’ll speak with him privately. We can pay the supplier a first payment from the fund. We can pay the rest next week. Keep your own money. I’ll book the engineer.',
  repair:
    'The engineer fitted the new pump. Hot water ran at every tap. Burak wrote the first payment and the amount still owed in the building account book. He and Tarık kept the repayment dates private.',
  tea: 'On Saturday, Hacer and Sevim rewrote the entrance notice over two cups of tea. The notice asked for quiet mornings. It did not demand explanations. This time each asked what the other meant.',
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
    'Could you hold this bit of packaging? I make little paper rooms after tea. That one has a window and no front door. My niece thinks I keep these catalogues only for paperwork. Please let me choose who sees them.',
  sevim:
    'I kept a pupil’s exercise books. I called him lazy. Later I learned he was caring for a sick parent. I am choosing an example for a lesson, and I keep stopping at his page. I was the one who judged him.',
  burak:
    'Please hold this folded paper harbour. Pull the tab and the paper ferry crosses it. I learned from a library book when I knew few people. Accounting is still my work. This does not have to be useful.',
  derya:
    'You asked about work boundaries and training. I can tell you why it is a difficult subject. I reported a scheduling error before anyone was harmed. Training offers stopped afterwards. I kept the letters and messages. I do not know whether the two events were connected.',
  tarik:
    'Could you help with the tape player? These tapes have bird recordings from different ferry stops. Some also have my wife’s voice. I choose what we listen to. I do not want those voices in a public archive. I do not know every bird’s name.',
} as const;
export const PRIVATE_SECRETS = Object.entries(PRIVATE_FACTS).map(([id, prop]) => ({
  prop,
  value: true,
  title: (
    {
      hacer: 'Hacer makes tiny paper rooms.',
      sevim: 'Sevim kept a former pupil’s exercise books.',
      burak: 'Burak makes moving paper models.',
      derya: 'Derya reported an old scheduling error. She does not know whether it affected her career.',
      tarik: 'Tarık keeps private bird recordings from ferry stops.',
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
    'Sevim told me privately that she once judged a pupil unfairly. She later learned he was caring for a sick parent.',
    'Sevim did not tell me about judging a pupil unfairly.',
  ],
  [PRIVATE_FACTS.burak]: [
    'Burak showed me a moving paper ferry. He makes models in private.',
    'Burak did not show me a paper model.',
  ],
  [PRIVATE_FACTS.derya]: [
    'Derya says she reported an old scheduling error before anyone was harmed. She later stopped receiving training offers. She does not know whether this was connected to her report.',
    'Derya did not tell me about an old scheduling error.',
  ],
  [PRIVATE_FACTS.tarik]: [
    'Tarık showed me private bird recordings. He asked me to keep the voices heard on the tapes private.',
    'Tarık did not show me his recordings.',
  ],
};
