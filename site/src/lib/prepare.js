/**
 * Какво трябва да е свалено, преди даден екран да се покаже.
 *
 * Екраните са писани да четат данните веднага (синхронно) — така са били
 * писани, когато всичко беше вградено в страницата. Вместо да се пренаписват
 * всичките, рутерът минава оттук: тегли нужното, показва „зарежда“, и чак
 * тогава вика екрана. Екраните остават непроменени.
 */
import {
  loadCatalog,
  loadSubject,
  loadChapter,
  loadFlashcards,
  loadQuiz,
  loadCases,
} from './content.js';
import { syncCatalog, syncSubjectChapters, defaultSubjectCode } from './catalog-sync.js';
import { cached, searchServer, loadOwnedForSearch, loadForAdmin } from './content.js';
import { escapeHtml } from '../parts/10-helpers.js';

/**
 * Коя тема ще покаже екранът с конспекта.
 *
 * ВАЖНО: логиката тук ТРЯБВА да съвпада с тази в renderConspect. Ако се
 * разминат, ще се тегли един конспект, а ще се показва друг — и темата ще
 * излиза празна. Затова: параметърът е `chapter`; ако липсва или е извън
 * обхвата, се пада на последно четената тема, иначе на първата.
 */
function activeChapterIndex(code, params) {
  const total = cached.chapters(code).length;
  const asked = parseInt(params && params.get('chapter'), 10);
  if (!Number.isNaN(asked) && asked >= 0 && asked < total) return asked;

  let last = 0;
  try {
    const st = window.state;
    if (st && st.lastTopic && typeof st.lastTopic[code] === 'number') last = st.lastTopic[code];
  } catch (e) { /* състоянието още не е заредено */ }
  return last >= 0 && last < total ? last : 0;
}

/**
 * Каталогът НЕ е задължителен, за да се покаже витрината.
 *
 * Началната страница, пакетите и цените са рекламни екрани — те трябва да
 * се виждат дори при спрян сървър, със списъка от кода. Ако тук се хвърли
 * грешка, посетителят вижда „Съдържанието не се зареди“ вместо сайта, а
 * това е най-лошото място да се случи.
 */
async function softCatalog() {
  try {
    await loadCatalog();
    await syncCatalog();
  } catch (err) {
    // Витрината се показва с данните от кода.
  }
}

/** Скелет по време на теглене — вместо празен екран. */
function showLoading(app) {
  if (!app) return;
  app.innerHTML = `
    <div class="container" style="padding:48px 0;">
      <div class="skeleton" style="height:28px;width:38%;margin-bottom:18px;"></div>
      <div class="skeleton" style="height:14px;width:92%;margin-bottom:10px;"></div>
      <div class="skeleton" style="height:14px;width:86%;margin-bottom:10px;"></div>
      <div class="skeleton" style="height:14px;width:74%;"></div>
    </div>`;
}

/**
 * Връща true, ако маршрутът е бил подготвен успешно.
 * При срив на мрежата се показва съобщение и екранът не се вика — по-добре
 * ясно съобщение, отколкото екран с празни списъци.
 */
export async function prepareRoute(path, params, app) {
  const seg = path.split('/');
  const code = seg[2];

  const needs = (() => {
    if (path === '/' || path === '' || path === '/packages' || path === '/pricing') return ['catalog'];
    if (path === '/dashboard') return ['catalog'];
    if (path === '/search') return ['search'];
    if (path.startsWith('/admin')) return ['admin'];
    if (!code) return [];
    if (path.startsWith('/subject/')) return ['catalog', 'subject'];
    if (path.startsWith('/conspect/')) return ['chapter'];
    if (path.startsWith('/flashcards/')) return ['flashcards'];
    if (path.startsWith('/quiz/')) return ['quiz'];
    if (path.startsWith('/cases/')) return ['cases'];
    if (path.startsWith('/review/')) return ['flashcards'];
    if (path.startsWith('/exam-setup/')) return ['subject'];
    if (path.startsWith('/exam-draw/')) return ['subject', 'quiz'];
    if (path.startsWith('/exam-draw-run/')) return ['subject', 'quiz'];
    if (path.startsWith('/notes/')) return ['subject'];
    if (path.startsWith('/mistakes-review/')) return ['quiz'];
    return [];
  })();

  if (!needs.length) return true;

  showLoading(app);

  try {
    for (const what of needs) {
      if (what === 'admin') {
        await softCatalog();
        // Панелът показва материала на избраната дисциплина; при смяна на
        // падащото меню адресът се променя и това се изпълнява отново.
        const chosen = (params && params.get('subj')) || defaultSubjectCode();
        if (chosen) await loadForAdmin(chosen);
      } else if (what === 'search') {
        await softCatalog();
        const q = (params && params.get('q')) || '';
        // Картите, тестовете и казусите на купените предмети — за да търси
        // из тях, както е търсело досега. Конспектите ги търси сървърът.
        await loadOwnedForSearch();
        window.__searchConspects = q.length >= 2 ? await searchServer(q) : null;
      } else if (what === 'catalog') {
        await softCatalog();
      } else if (what === 'subject') {
        await loadSubject(code);
        syncSubjectChapters(code);
      } else if (what === 'flashcards') {
        await loadFlashcards(code);
        syncSubjectChapters(code);
      } else if (what === 'quiz') {
        await loadQuiz(code);
        syncSubjectChapters(code);
      } else if (what === 'cases') {
        await loadCases(code);
        syncSubjectChapters(code);
      }
      else if (what === 'chapter') {
        await loadSubject(code);
        syncSubjectChapters(code);
        await loadChapter(code, activeChapterIndex(code, params));
      }
    }
    return true;
  } catch (err) {
    if (app) {
      app.innerHTML = `
        <div class="container" style="padding:64px 0;text-align:center;">
          <h2 style="margin-bottom:8px;">Съдържанието не се зареди</h2>
          <p style="color:var(--text-2);margin-bottom:18px;">${
            err && err.message ? escapeHtml(err.message) : 'Няма връзка със сървъра.'
          }</p>
          <button class="btn btn-primary" onclick="location.reload()">Опитай пак</button>
        </div>`;
    }
    return false;
  }
}
