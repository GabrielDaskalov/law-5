/* Автоматично добавени връзки при разделянето на монолита. */
import { DEFAULT_STATE_JSON, STATE_KEY, loadState } from './06-state.js';
import { activateProfile, currentProfileId, snapshotProfile } from './07-profili.js';
import { toast, updateNav } from './10-helpers.js';
import { LocalAuth, login } from './24-lokalni-akaunti.js';

/* =============================================================================
   BACKEND ИНТЕГРАЦИЯ — автоматично разпознаване.
   Ако на PA_BACKEND_URL има работещ сървър (GET /health), сайтът ползва
   истинските API-та: вход/регистрация с истински акаунти (JWT), Stripe
   плащания, покупки и синхронизация на прогреса между устройства.
   Ако няма сървър — всичко работи локално (demo режим), както досега.

   Адрес на сървъра: localStorage 'pa_api_url', иначе:
     - ако сайтът е отворен от домейн → същия домейн (nginx проксира /api)
     - ако е отворен като файл → http://localhost:3000
   ============================================================================= */
// ВНИМАНИЕ: адресът на API-то се чете от localStorage САМО при разработка.
// В production това е ескалация на XSS: един ред чужд код записва „pa_api_url"
// и всички заявки — включително самият вход с паролата — тръгват към чужд
// сървър, при това устойчиво (преживява презареждане).
const PA_RAZRABOTKA = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
  || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const PA_BACKEND_URL = (PA_RAZRABOTKA && localStorage.getItem('pa_api_url'))
  || (location.protocol.startsWith('http') ? '' : 'http://localhost:3000');

let PA_BACKEND = null; // null = още не е проверено

async function backendReady() {
  if (PA_BACKEND !== null) return PA_BACKEND;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(PA_BACKEND_URL + '/health', { signal: ctrl.signal });
    clearTimeout(t);
    PA_BACKEND = r.ok;
  } catch (e) { PA_BACKEND = false; }
  if (PA_BACKEND) console.info('[backend] Свързан:', PA_BACKEND_URL || '(същия домейн)');
  return PA_BACKEND;
}

function getJwt() { return localStorage.getItem('pa_jwt'); }
function setJwt(t) { t ? localStorage.setItem('pa_jwt', t) : localStorage.removeItem('pa_jwt'); }

/**
 * Постоянен номер на това устройство.
 *
 * Служи за едно-единствено нещо: сървърът да различи „същият лаптоп влиза
 * пак" от „ново устройство". Без него всяко повторно влизане би изяждало от
 * лимита и човек би изхвърлял сам себе си.
 *
 * Нарочно НЕ е пръстов отпечатък на браузъра. Обикновено случайно число,
 * записано тук — не издава нищо за машината и се нулира с изчистването на
 * данните на сайта (тогава просто се брои за ново устройство).
 */
function deviceId() {
  const K = 'pa_device_id';
  try {
    let v = localStorage.getItem(K);
    if (!v) {
      const b = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(b);
      v = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(K, v);
    }
    return v;
  } catch (e) {
    // Браузър без хранилище (частен режим при някои). Работи и без номер —
    // просто всяко влизане се брои за ново устройство.
    return '';
  }
}

/**
 * Показва ЕДИН път защо потребителят е изхвърлен и го връща към входа.
 *
 * Флагът е нужен, защото при изхвърляне падат наведнъж всички заявки на
 * страницата — без него човек получава пет еднакви съобщения едно върху
 * друго и това изглежда като счупен сайт, а не като обяснение.
 */
let vecheKazano = false;
function izhvarlenSaObyasnenie(sabshtenie) {
  if (vecheKazano) return;
  vecheKazano = true;
  setTimeout(() => { vecheKazano = false; }, 5000);
  try { sessionStorage.setItem('pa_izhod_prichina', sabshtenie); } catch (e) { /* без хранилище */ }

  // Локалното състояние също се изчиства. Иначе горе вдясно продължава да
  // стои името на потребителя, докато отдолу пише „Вход" — изглежда като
  // повреда точно в момента, в който човек трябва да е спокоен, че системата
  // работи. Прогресът остава в профила на устройството и се връща при вход.
  try {
    state.user = null;
    saveState();
    updateNav();
  } catch (e) { /* ако състоянието още не е заредено */ }

  toast('⚠ ' + sabshtenie);
  if (!location.hash.startsWith('#/login')) {
    setTimeout(() => { location.hash = '#/login'; }, 400);
  }
}

/**
 * Втора стъпка от прогресивната реакция: лента със съобщение.
 *
 * Стои, докато човек не я махне, вместо да мине като съобщение за две
 * секунди. Точно това съобщение не бива да се пропусне — то е единственото
 * предупреждение, преди системата да поиска смяна на паролата.
 */
function pokazhiPreduprezhdenie() {
  let tekst = '';
  try {
    // Ако вече се иска смяна на паролата, лентата отпада: същото изречение
    // стои и над формата в настройките, а там е и действието. Две копия на
    // едно съобщение изглеждат като грешка, не като настойчивост.
    if (sessionStorage.getItem('pa_iska_parola')) return;
    tekst = sessionStorage.getItem('pa_preduprezhdenie') || '';
  } catch (e) { return; }
  if (!tekst || document.getElementById('paPredupr')) return;

  const el = document.createElement('div');
  el.id = 'paPredupr';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span></span>'
    + '<a href="#/settings">Виж устройствата</a>'
    + '<button type="button" aria-label="Скрий">Разбрах</button>';
  el.querySelector('span').textContent = tekst;
  el.querySelector('button').onclick = () => {
    el.remove();
    try { sessionStorage.removeItem('pa_preduprezhdenie'); } catch (e) { /* празно */ }
  };
  document.body.appendChild(el);
}

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const jwt = getJwt();
  if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
  const du = deviceId();
  if (du) headers['X-Device-Id'] = du;
  const res = await fetch(PA_BACKEND_URL + path, { ...opts, headers });
  let json = {};
  try { json = await res.json(); } catch (e) { /* празно тяло */ }
  if (res.status === 401 && jwt) {
    setJwt(null);
    // Мълчаливото изхвърляне изглежда като повреда. Сървърът праща код и
    // изречение — показваме изречението, за да е ясно какво се е случило.
    const kod = String(json.code || '');
    if (kod.startsWith('SESSION_REVOKED') || kod === 'SESSION_REQUIRED') {
      izhvarlenSaObyasnenie(json.message || 'Сесията е прекратена. Влез отново.');
    }
  }
  // Трета стъпка от прогресивната реакция: акаунтът е спрян до смяна на
  // паролата. Без това човекът получава „Грешка 403“ на всеки екран и няма
  // как да разбере какво се иска от него.
  if (res.status === 403 && json.code === 'PASSWORD_CHANGE_REQUIRED') {
    iskaNovaParola(json.message);
  }
  if (!res.ok) {
    // Кодът пътува до извикващия — някои откази искат обяснение на екрана,
    // а не мимолетно съобщение (например „потвърди новото устройство“).
    const gr = new Error(json.message || ('Грешка ' + res.status));
    gr.kod = json.code || '';
    gr.status = res.status;
    throw gr;
  }
  return json;
}

/** Отвежда към смяна на паролата — веднъж, не при всяка провалена заявка. */
let vecheOtvedeno = false;
function iskaNovaParola(sabshtenie) {
  if (vecheOtvedeno) return;
  vecheOtvedeno = true;
  setTimeout(() => { vecheOtvedeno = false; }, 6000);
  try { sessionStorage.setItem('pa_iska_parola', sabshtenie || '1'); } catch (e) { /* без хранилище */ }
  toast('⚠ ' + (sabshtenie || 'Смени паролата си, за да продължиш.'));
  if (!location.hash.startsWith('#/settings')) {
    setTimeout(() => { location.hash = '#/settings'; }, 500);
  }
}

/* Вход/регистрация: с backend → истински акаунт (JWT); без → локален demo */
async function authSubmit(form, mode) {
  // ВНИМАНИЕ: form.name връща името на <form> елемента, не полето "name"!
  const email = (form.querySelector('input[name="email"]')?.value || '').trim();
  const password = form.querySelector('input[type="password"]')?.value || '';
  const name = (form.querySelector('input[name="name"]')?.value || '').trim();

  // Индикация за зареждане — бутонът се заключва, докато тече заявката
  const sbtn = form.querySelector('button[type="submit"]') || form.querySelector('button');
  const btnRestore = () => { if (sbtn) { sbtn.disabled = false; sbtn.textContent = sbtn.dataset.orig || sbtn.textContent; } };
  if (sbtn) {
    sbtn.dataset.orig = sbtn.textContent;
    sbtn.disabled = true;
    sbtn.textContent = mode === 'login' ? 'Влизане…' : 'Създаване…';
  }

  if (await backendReady()) {
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, name };
      const r = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      setJwt(r.data.token);
      let profName = name || email.split('@')[0];
      try {
        const me = await apiFetch('/api/user/profile');
        profName = me.data.name || profName;
        window.PA_ROLE = me.data.role || 'student';
      } catch (e) { /* профилът не е критичен */ }
      login(email, profName);         // локалните профили остават (кеш на устройството)
      await backendPostLogin();       // покупки + прогрес от сървъра
      location.hash = '#/dashboard';

      // Казва се на глас: тихото изхвърляне на другия край изглежда като
      // повреда, а изреченото е точно това, което кара споделящите да се
      // откажат — вижда се, че системата брои устройствата.
      //
      // Съобщението е ПОСЛЕДНО и с малко закъснение нарочно: лентата за
      // съобщения е една, „Добре дошъл" от входа и рисуването на таблото
      // идват след него и иначе го изтриват, преди някой да го е прочел.
      if (r.data.izhvarleno_ustrojstvo) {
        setTimeout(() => {
          toast('Излязохме те от другото устройство — един акаунт работи на едно устройство.');
        }, 700);
      }

      // Втора стъпка: съобщение, без да се пипа достъпът. Носи се до таблото
      // и стои там като лента, вместо да мине като съобщение за две секунди —
      // това е точно съобщението, което не бива да се пропусне.
      if (r.data.preduprezhdenie) {
        try { sessionStorage.setItem('pa_preduprezhdenie', r.data.preduprezhdenie); } catch (e) { /* без хранилище */ }
      }
      // Трета стъпка: направо към смяната на паролата.
      if (r.data.iska_nova_parola) {
        try {
          sessionStorage.setItem('pa_iska_parola', r.data.preduprezhdenie || '1');
          sessionStorage.removeItem('pa_preduprezhdenie');
        } catch (e) { /* без хранилище */ }
        const stara = document.getElementById('paPredupr');
        if (stara) stara.remove();
        location.hash = '#/settings';
        return;
      }
    } catch (err) {
      btnRestore();
      if (err && err.kod === 'DEVICE_CONFIRM_REQUIRED') {
        // Това не е „сгрешена парола“ и не бива да изглежда така. Обяснението
        // е дълго и се чете — затова остава на екрана, а не минава като
        // съобщение за две секунди.
        pokazhiNaVhoda(err.message);
        return;
      }
      toast('⚠ ' + (err.message || 'Неуспешен вход'));
    }
    return;
  }

/** Слага обяснение в картата за вход (или го подава на следващото рисуване). */
function pokazhiNaVhoda(sabshtenie) {
  try { sessionStorage.setItem('pa_izhod_prichina', sabshtenie); } catch (e) { /* без хранилище */ }
  const karta = document.querySelector('.auth-card');
  const stara = document.querySelector('.auth-izhod');
  if (stara) stara.remove();
  if (karta) {
    const el = document.createElement('div');
    el.className = 'auth-izhod';
    el.setAttribute('role', 'status');
    el.textContent = sabshtenie;
    const sub = karta.querySelector('.auth-sub');
    if (sub && sub.nextSibling) karta.insertBefore(el, sub.nextSibling);
    else karta.prepend(el);
    try { sessionStorage.removeItem('pa_izhod_prichina'); } catch (e) { /* празно */ }
  }
}

  // Без сървър: локални акаунти с истински пароли (пазени в този браузър)
  try {
    if (mode === 'register') {
      await LocalAuth.register(email, name, password);
      login(email, name);
      location.hash = '#/dashboard';
    } else {
      const v = await LocalAuth.verify(email, password);
      if (!v.ok) {
        btnRestore();
        toast(v.code === 'no-account'
          ? '⚠ Няма акаунт с този имейл — регистрирай се.'
          : '⚠ Грешна парола. Опитай пак или ползвай „Забравена парола“.');
        return;
      }
      LocalAuth.touch(email);
      login(email, v.acc.name);
      location.hash = '#/dashboard';
    }
  } catch (err) {
    btnRestore();
    toast('⚠ ' + (err.message || 'Грешка при входа'));
  }
}

/* След вход: изтегли покупките и прогреса от сървъра */
async function backendPostLogin() {
  // Ролята се сваля при ВСЯКО зареждане, не само веднага след вход.
  // Иначе след презареждане (F5) `window.PA_ROLE` е празно, админският
  // панел решава, че този не е администратор, и си затваря вратата пред
  // собствения си човек.
  try {
    const me = await apiFetch('/api/user/profile');
    window.PA_ROLE = (me.data && me.data.role) || 'student';
    // Лентата горе се пререрисува: тя вече е нарисувана, когато ролята
    // пристига, а от ролята зависи дали има връзка към админския панел.
    updateNav();
  } catch (e) { /* профилът не е критичен за останалото */ }

  try {
    const r = await apiFetch('/api/me/purchases');
    (r.data || []).forEach(pu => {
      if (!state.purchased.includes(pu.package_id)) state.purchased.push(pu.package_id);
    });
  } catch (e) { /* офлайн — локалните остават */ }

  try {
    const r = await apiFetch('/api/me/state');
    if (r.data && r.data.state) {
      const keepUser = state.user;
      const localPurchased = state.purchased.slice();
      state = { ...state, ...r.data.state };
      state.user = keepUser;
      // покупките: обединение (сървър + локални + вече слетите)
      if (!Array.isArray(state.purchased)) state.purchased = [];
      localPurchased.forEach(pid => { if (!state.purchased.includes(pid)) state.purchased.push(pid); });
    }
  } catch (e) { /* няма запазен прогрес — ок */ }

  saveState();
}

/* Прогресът се качва автоматично (debounce 4 сек след последната промяна) */
function scheduleStateSync() {
  if (PA_BACKEND !== true || !getJwt()) return;
  clearTimeout(window.__stateSyncT);
  window.__stateSyncT = setTimeout(() => {
    try {
      const snapshot = JSON.parse(JSON.stringify(state));
      delete snapshot.user;
      apiFetch('/api/me/state', {
        method: 'PUT',
        body: JSON.stringify({ state: snapshot, device_label: navigator.platform || 'browser' }),
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }, 4000);
}

function switchProfile(newId) {
  const cur = currentProfileId();
  if (cur === newId) return;
  // Запази текущия профил
  snapshotProfile(cur);
  const hasProfile = localStorage.getItem('pa_profile::' + newId) !== null;
  if (!hasProfile && cur === 'guest') {
    // Първо влизане на този акаунт: гост прогресът става негов (миграция).
    // Гост профилът се изпразва, за да не се прехвърли и на СЛЕДВАЩ акаунт.
    localStorage.setItem('pa_active_profile', newId);
    snapshotProfile(newId);
    localStorage.setItem('pa_profile::guest', '{}');
    state = JSON.parse(DEFAULT_STATE_JSON);
    loadState();
    return;
  }
  activateProfile(newId);
}

function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  // Ако има свързан backend — прогресът се качва и там (виж scheduleStateSync)
  if (typeof scheduleStateSync === 'function') scheduleStateSync();
}

export { PA_BACKEND, PA_BACKEND_URL, apiFetch, authSubmit, backendPostLogin, backendReady, deviceId, getJwt, pokazhiPreduprezhdenie, saveState, scheduleStateSync, setJwt, switchProfile };
