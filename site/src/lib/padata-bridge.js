/**
 * МОСТ КЪМ СТАРИЯ `window.PA_DATA`.
 *
 * ЗАЩО:
 * Из кода има към 40 места, които четат `window.PA_DATA.<нещо>[предмет]` —
 * началната страница, търсенето, AI асистентът, админът, конспектът.
 * Да се пренапишат всичките наведнъж значи да се пипнат почти всички
 * екрани, а точно това не искаме: екраните са проверени и работят.
 *
 * Затова `PA_DATA` остава като име, но вече не е 12,5 MB вградени данни, а
 * прозорец към кеша, напълнен от сървъра. Следствията са важни:
 *
 *   • нищо не съществува тук, преди сървърът да го е дал — а той дава само
 *     това, за което потребителят има право. Заключеното просто липсва,
 *     вместо да е налично и „скрито с CSS“;
 *   • страницата вече не носи учебно съдържание в себе си.
 *
 * Това е преходно решение. Когато екраните минат директно към
 * `ContentStore`/`Content`, този файл се изтрива и нищо друго не се променя.
 */
import { cached } from './content.js';

/** Заглавията на темите — това ползват списъците и навигацията. */
function chaptersFor(code) {
  return cached.chapters(code).map((ch) => ch.heading);
}

/** Пълният конспект — само темите, чийто текст вече е свален. */
function conspectFor(code) {
  return cached.chapters(code).map((ch) => ({
    heading: ch.heading,
    sections: ch.sections || [],
    refs: ch.refs || [],
    locked: !!ch.locked,
  }));
}

/**
 * Обект, който се държи като речник по код на предмет, но чете от кеша
 * при всяко обръщение. `Proxy` е нужен, защото кодът пише
 * `PA_DATA.chapters.oblp` — тоест достъп до свойство, не извикване.
 */
function dictionary(read) {
  return new Proxy(
    {},
    {
      get(_t, code) {
        if (typeof code !== 'string') return undefined;
        return read(code);
      },
      has(_t, code) {
        return typeof code === 'string';
      },
      ownKeys() {
        return [];
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true };
      },
    },
  );
}

export function installPaDataBridge() {
  if (window.PA_DATA && window.PA_DATA.__bridge) return;

  window.PA_DATA = {
    __bridge: true,
    chapters: dictionary(chaptersFor),
    conspectFull: dictionary(conspectFor),
    conspect: dictionary(conspectFor),
    flashcards: dictionary((code) => cached.flashcards(code)),
    quizzes: dictionary((code) => cached.quiz(code)),
    cases: dictionary((code) => cached.cases(code)),
  };
}

installPaDataBridge();
