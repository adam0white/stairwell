/** The building's existing authored door dialogue. */
import type { Rid } from './building-cast.ts';
export const THANKS: Record<Rid, string[]> = {
  hacer: [
    'Ah, there you are. Will you sit for a minute? No? You are always busy.',
    'You are a good boy. Rıza was never this quick.',
    'Leave it on the stool. Be careful around the cat, if there is a cat.',
  ],
  sevim: [
    'Thank you. You got it exactly right, for once.',
    'Put it there, please. Be careful of the mat.',
    'You arrived on time. I noticed.',
  ],
  burak: ['Thanks, my friend. I mean it.', 'That is perfect. Thank you.', 'You have helped me so much.'],
  derya: ['You’re kind. Thank you.', 'Oh, thank you. I am very tired.', 'Thank you. I mean it.'],
  tarik: [
    'Thank you, son. These stairs are hard for me.',
    'May your legs stay strong. Thank you for coming up here.',
    'Thank you. Sit a minute, if you can.',
  ],
};
export const JOB_THANKS: Record<Rid, string[]> = {
  hacer: [
    'Look at that. It is like new. Rıza used to complain the whole time.',
    'Good. I do not have to worry about that job now.',
  ],
  sevim: ['You did it properly. Thank you.', 'That’s been bothering me for a week.'],
  burak: ['You have helped me so much, honestly.', 'I owe you a coffee.'],
  derya: ['Thank you. That is one less thing to do.', 'You didn’t have to do that so well.'],
  tarik: [
    'I used to be able to do that with my own hands. Thank you, son.',
    'Sit and have a tea for five minutes.',
  ],
};
export const LATE_LINES: Record<Rid, string[]> = {
  hacer: [
    'You are here at last. I nearly sent someone down for you.',
    'You are late. Rıza would have been late too, but he would have had a story.',
  ],
  sevim: ['It has gone cold. Do not worry.', 'I thought you were not coming.'],
  burak: [
    'That is all right. I managed without it. Thank you anyway.',
    'Ah, I had already managed without it. Thank you.',
  ],
  derya: ['It is all right. Everyone is late today.', 'Thanks. I nearly went myself.'],
  tarik: [
    'I waited. It doesn’t matter. Thank you.',
    'There you are. I thought you had forgotten the old man.',
  ],
};

export const SIT_LINES: Record<Rid, string[]> = {
  hacer: [
    'I used to work behind a shop counter. Now my niece has family paperwork for us in Istanbul.',
    'The plane tree outside this window drops leaves shaped like little boats. I keep some between catalogues.',
    'Sevim corrected my notice. She thought I wanted every visitor to explain themselves. I meant a quiet entrance.',
  ],
  sevim: [
    'I listened to children reading aloud for forty years. I still hear them in the evenings.',
    'Hacer heard a correction as a command. Perhaps I could have asked what she meant first.',
    'My child writes from abroad. I answer too formally, then wonder why the conversation feels distant.',
  ],
  burak: [
    'You can tell when an account is complete. In a conversation, you rarely know when you have said enough.',
    'Could you hold this fold a moment? No, let us do it another evening. It is not quite ready.',
    'I like accounting. I also like making something that does not have to be useful.',
  ],
  derya: [
    'People are honest at four in the morning. Everybody says what they mean at four.',
    'I sleep with the pillow over my head. I still hear your bell through it.',
    'People on the step count my visitors. Let them count.',
  ],
  tarik: [
    'In 1974 the ferry froze in the harbour. Did I tell you? We walked to Karaköy on the ice. Nobody believes me.',
    'My family visits when they can. When they cancel a visit, I still notice the time I would have spent with them.',
    'I worked on the ferry route to Kadıköy for forty years. I knew the route without looking. Some mornings I did not look.',
    'You climb those stairs for me every day. You have saved my legs some work. I am grateful.',
  ],
};
