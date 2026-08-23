import { cached, resetContentCache } from '../lib/content.js';
import * as AdminApi from '../lib/admin-content.js';
/* Автоматично добавени връзки при разделянето на монолита. */
import { CASE_CONTENT } from './05-case-studies.js';
import { saveState } from './09-backend-integraciya.js';
import { LocalAuth } from './24-lokalni-akaunti.js';

/* =============================================================================
   DATA SERVICE — abstraction layer (currently localStorage; swap for backend later)
   ============================================================================= */
const ContentStore = {
  /* Четене.
     ПРОМЯНА СПРЯМО СТАРИЯ САЙТ: източникът вече не е вграденият в
     страницата PA_DATA (12,5 MB, свалян от всеки посетител), а кешът,
     напълнен от сървъра според това какво е купено. Подписите на методите
     са същите, затова нито един екран не е пипан.

     Редът остава: първо ръчните промени на админа, после свалените данни. */
  flashcards(subjId) {
    if (state.contentOverrides.flashcards && state.contentOverrides.flashcards[subjId]) return state.contentOverrides.flashcards[subjId];
    return cached.flashcards(subjId);
  },
  cases(subjId) {
    if (state.contentOverrides.cases && state.contentOverrides.cases[subjId]) return state.contentOverrides.cases[subjId];
    const fromServer = cached.cases(subjId);
    return fromServer.length ? fromServer : ((typeof CASE_CONTENT !== 'undefined' && CASE_CONTENT[subjId]) || []);
  },
  quiz(subjId) {
    if (state.contentOverrides.quizzes && state.contentOverrides.quizzes[subjId]) return state.contentOverrides.quizzes[subjId];
    return cached.quiz(subjId);
  },
  /** Конспектът по теми — заглавията идват с темите, текстът при отваряне. */
  chapters(subjId) {
    return cached.chapters(subjId);
  },
  /** Има ли право потребителят на пълния предмет (сървърът е отсъдил). */
  access(subjId) {
    return cached.access(subjId);
  },
  // Write — copies to overrides if not already there, then mutates
  ensureOverride(kind, subjId) {
    if (!state.contentOverrides[kind]) state.contentOverrides[kind] = {};
    if (!state.contentOverrides[kind][subjId]) {
      const src = kind === 'flashcards' ? ContentStore.flashcards(subjId)
                : kind === 'cases' ? ContentStore.cases(subjId)
                : ContentStore.quiz(subjId);
      // deep clone
      state.contentOverrides[kind][subjId] = JSON.parse(JSON.stringify(src));
    }
    return state.contentOverrides[kind][subjId];
  },
  /* ЗАПИС.
     ПРОМЯНА СПРЯМО СТАРИЯ САЙТ: когато е влязъл истински админ, промяната
     отива в базата и я виждат всички студенти. Досега се записваше само в
     localStorage на този браузър — тоест поправката оставаше при админа.

     Без сървър (или без админски права) поведението е както преди: локална
     промяна, за да не се губи работа при временен проблем. */
  updateItem(kind, subjId, idx, patch) {
    const current = kind === 'flashcards' ? ContentStore.flashcards(subjId)
                  : kind === 'cases' ? ContentStore.cases(subjId)
                  : ContentStore.quiz(subjId);
    const existing = current[idx];

    if (AdminApi.canWriteToServer() && existing && existing.id) {
      const merged = Object.assign({}, existing, patch, { __subject: subjId });
      AdminApi.updateItem(kind, merged)
        .then(() => {
          resetContentCache();
          toast('Записано на сървъра — вижда се от всички', true);
        })
        .catch((err) => toast('⚠ Записът не мина: ' + err.message));
      // Веднага и локално, за да няма примигване до отговора на сървъра.
      if (existing) Object.assign(existing, patch);
      Activity.log('content.edit', subjId, { kind, idx, server: true });
      saveState();
      return true;
    }

    const arr = ContentStore.ensureOverride(kind, subjId);
    if (idx < 0 || idx >= arr.length) return false;
    arr[idx] = Object.assign({}, arr[idx], patch);
    Activity.log('content.edit', subjId, { kind, idx });
    saveState();
    return true;
  },
  deleteItem(kind, subjId, idx) {
    const current = kind === 'flashcards' ? ContentStore.flashcards(subjId)
                  : kind === 'cases' ? ContentStore.cases(subjId)
                  : ContentStore.quiz(subjId);
    const existing = current[idx];

    if (AdminApi.canWriteToServer() && existing && existing.id) {
      AdminApi.deleteItem(kind, existing)
        .then(() => {
          resetContentCache();
          toast('Изтрито от базата (пази се в журнала)', true);
        })
        .catch((err) => toast('⚠ Изтриването не мина: ' + err.message));
      current.splice(idx, 1);
      Activity.log('content.delete', subjId, { kind, idx, server: true });
      saveState();
      return true;
    }

    const arr = ContentStore.ensureOverride(kind, subjId);
    if (idx < 0 || idx >= arr.length) return false;
    arr.splice(idx, 1);
    Activity.log('content.delete', subjId, { kind, idx });
    saveState();
    return true;
  },
  addItem(kind, subjId, item) {
    if (AdminApi.canWriteToServer()) {
      AdminApi.createItem(kind, subjId, item)
        .then((created) => {
          if (created && created.id) item.id = created.id;
          resetContentCache();
          toast('Добавено в базата', true);
        })
        .catch((err) => toast('⚠ Добавянето не мина: ' + err.message));
      const list = kind === 'flashcards' ? ContentStore.flashcards(subjId)
                 : kind === 'cases' ? ContentStore.cases(subjId)
                 : ContentStore.quiz(subjId);
      if (kind === 'cases' && !item.num) item.num = list.length + 1;
      list.push(item);
      Activity.log('content.add', subjId, { kind, server: true });
      saveState();
      return true;
    }

    const arr = ContentStore.ensureOverride(kind, subjId);
    if (kind === 'cases' && !item.num) item.num = arr.length + 1;
    arr.push(item);
    Activity.log('content.add', subjId, { kind });
    saveState();
    return true;
  },
  hasOverride(kind, subjId) {
    return !!(state.contentOverrides[kind] && state.contentOverrides[kind][subjId]);
  },
  revertOverride(kind, subjId) {
    if (state.contentOverrides[kind] && state.contentOverrides[kind][subjId]) {
      delete state.contentOverrides[kind][subjId];
      Activity.log('content.revert', subjId, { kind });
      saveState();
    }
  },
};

/* Lightweight event/activity log — capped, structured. Powers admin analytics. */
const Activity = {
  log(type, subj, payload) {
    if (!state.events) state.events = [];
    state.events.push({ ts: Date.now(), type, subj: subj || null, payload: payload || null });
    if (state.events.length > 500) state.events = state.events.slice(-500);
    // do NOT saveState here — caller usually saves
  },
  recent(n) {
    return (state.events || []).slice(-n).reverse();
  },
  byDate() {
    const out = {};
    (state.events || []).forEach(e => {
      const d = new Date(e.ts).toISOString().slice(0, 10);
      out[d] = (out[d] || 0) + 1;
    });
    return out;
  },
};

/* User accounts abstraction. Currently single local user; structured for future backend. */
const Users = {
  current() { return state.user || null; },
  list() {
    // Всички локални акаунти (регистрирани в този браузър) + статистика от профилите им
    const accounts = (typeof LocalAuth !== 'undefined') ? LocalAuth.all() : {};
    const emails = Object.keys(accounts);
    const readProfile = (email) => {
      if (state.user && (state.user.email || '').toLowerCase() === email) return state; // живите данни
      try { return JSON.parse(localStorage.getItem('pa_profile::' + email) || '{}'); } catch (e) { return {}; }
    };
    if (!emails.length) {
      const u = state.user;
      if (!u) return [];
      return [{ id: u.email || 'me', email: u.email, name: u.name || u.email, createdAt: state.userCreatedAt || Date.now(), lastActive: Date.now(), purchased: state.purchased || [], mistakes: 0 }];
    }
    return emails.map(email => {
      const acc = accounts[email];
      const prof = readProfile(email);
      const mistakes = Object.values(prof.mistakes || {}).reduce((a, arr) => a + (arr || []).length, 0);
      return {
        id: email,
        email,
        name: acc.name || email.split('@')[0],
        createdAt: acc.createdAt || null,
        lastActive: acc.lastActive || null,
        purchased: prof.purchased || [],
        mistakes,
        topicsDone: Object.values(prof.topicCompleted || {}).reduce((a, o) => a + Object.keys(o || {}).length, 0),
      };
    }).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  },
};


/**
 * Админ ли е този, който гледа.
 *
 * ПОПРАВКА: тук стоеше списък с ЕДИН твърдо записан имейл. Три последствия:
 *   1. Всеки друг администратор, създаден в базата, виждаше „достъп само за
 *      собственика“ — панелът беше недостъпен за него, макар сървърът да го
 *      признава.
 *   2. Имейлът на собственика стоеше в публично свалимия JavaScript.
 *   3. Проверката се правеше по стойност, която живее в браузъра — тоест
 *      всеки можеше да си я нагласи и да отвори панела.
 *
 * Ролята идва от сървъра (`/api/user/profile` я записва в `window.PA_ROLE`)
 * и това е единственият източник. Дори тук да се излъже, всеки админски
 * маршрут проверява ролята отново в базата — това отваря само екрана,
 * не и данните. Затова празният панел на самозванец е празен наистина.
 *
 * Без сървър (демо режим на едно устройство) остава списъкът от localStorage
 * `pa_admin_emails`, за да може платформата да се разглежда и офлайн.
 */
function isAdmin() {
  if (typeof window !== 'undefined' && window.PA_ROLE) return window.PA_ROLE === 'admin';
  if (!state.user) return false;
  let spisak = [];
  try { spisak = JSON.parse(localStorage.getItem('pa_admin_emails') || '[]'); } catch (e) { spisak = []; }
  return Array.isArray(spisak)
    && spisak.map((x) => String(x).toLowerCase()).indexOf((state.user.email || '').toLowerCase()) !== -1;
}

/** Оставено за съвместимост с код, който още го внася. Вече е празен. */
const ADMIN_EMAILS = [];

export { ADMIN_EMAILS, Activity, ContentStore, Users, isAdmin };
