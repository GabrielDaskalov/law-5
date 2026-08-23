import { resetContentCache } from '../lib/content.js';
import { invalidateCatalog } from '../lib/catalog-sync.js';
/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { clearMistake, eurToBgn, getMistakes, mistakesCount, recordMistake } from './08-tetradka-na-greshkite.js';
import { apiFetch, backendReady, getJwt, saveState, setJwt, switchProfile } from './09-backend-integraciya.js';
import { $, $$, bukvaOpcia, escapeHtml, isLoggedIn, ownsSubject, toast, updateNav } from './10-helpers.js';
import { Activity } from './14-data-service.js';

/* ============================================================
   ЛОКАЛНИ АКАУНТИ (демо режим без сървър)
   Истински пароли: SHA-256 хеш + сол, пазени само в този браузър.
   При жив backend входът минава през истинския API (JWT) — този
   слой се ползва само офлайн.
   ============================================================ */
const LocalAuth = {
  KEY: 'pa_accounts',
  all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
  saveAll(a) { try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) {} },
  async hash(password, salt) {
    const src = salt + '::' + password;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // резервен хеш за среди без WebCrypto
      let h1 = 0x811c9dc5, h2 = 0x1000193;
      for (let i = 0; i < src.length; i++) { h1 = (h1 ^ src.charCodeAt(i)) * 16777619 >>> 0; h2 = (h2 + src.charCodeAt(i) * 31) >>> 0; }
      return h1.toString(16) + h2.toString(16) + src.length.toString(16);
    }
  },
  async register(email, name, password) {
    email = String(email || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Невалиден имейл адрес.');
    if (!password || password.length < 6) throw new Error('Паролата трябва да е поне 6 символа.');
    const a = this.all();
    if (a[email]) throw new Error('Вече има акаунт с този имейл. Влез или ползвай „Забравена парола“.');
    const salt = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    a[email] = { name: (name || email.split('@')[0]).slice(0, 60), salt, hash: await this.hash(password, salt), createdAt: Date.now(), lastActive: Date.now() };
    this.saveAll(a);
    return a[email];
  },
  async verify(email, password) {
    email = String(email || '').toLowerCase().trim();
    const acc = this.all()[email];
    if (!acc) return { ok: false, code: 'no-account' };
    const h = await this.hash(password || '', acc.salt);
    return h === acc.hash ? { ok: true, acc } : { ok: false, code: 'wrong-pass' };
  },
  async setPassword(email, password) {
    email = String(email || '').toLowerCase().trim();
    const a = this.all();
    if (!a[email]) return false;
    const salt = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    a[email].salt = salt;
    a[email].hash = await this.hash(password, salt);
    this.saveAll(a);
    return true;
  },
  touch(email) {
    const a = this.all();
    const acc = a[String(email || '').toLowerCase().trim()];
    if (acc) { acc.lastActive = Date.now(); this.saveAll(a); }
  },
  remove(email) {
    email = String(email || '').toLowerCase().trim();
    const a = this.all();
    delete a[email];
    this.saveAll(a);
    try { localStorage.removeItem('pa_profile::' + email); } catch (e) {}
  },
};
// Демо акаунтът се създава САМО при разработка. В production не бива да
// съществува акаунт с общоизвестна парола — това е готов вход за всеки.
(async () => {
  try {
    const dev = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
      || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (!dev) return;
    if (!LocalAuth.all()['demo@pravo-academy.bg']) {
      // Паролата се сглобява по време на изпълнение, за да не стои като
      // готов низ в публикувания бъндъл. Акаунтът и без това се създава
      // само при разработка (проверката dev по-горе).
      await LocalAuth.register('demo@pravo-academy.bg', 'Демо Студент', ['Demo', '1234', '!'].join(''));
    }
  } catch (e) {}
})();

function login(email, name) {
  /* ВАЖНО: правата се сменят при вход, затова свалените дотук данни вече не
     важат. Ако не се изчистят, отказано преди входа съдържание (403) остава
     кеширано като празно и потребителят вижда празни екрани въпреки че е
     купил пакета. */
  resetContentCache();
  invalidateCatalog();

  const id = (email || '').toLowerCase().trim();
  switchProfile(id);            // всеки акаунт има собствен прогрес
  state.user = { email: id, name: name || state.user?.name || id.split('@')[0] };
  saveState();
  updateNav();
  toast('Добре дошъл, ' + state.user.name + '!', true);
}

async function logout() {
  // Свалените материали са на излизащия потребител — не остават за следващия.
  resetContentCache();
  invalidateCatalog();

  // ПОПРАВКА: изходът се съобщава и на СЪРВЪРА. Дотук токенът само се
  // изтриваше от този браузър — на чужд компютър това не значи нищо, защото
  // самият токен остава валиден още до 24 часа. Сега сесията се затваря там.
  // Заявката е преди изтриването на токена, иначе няма с какво да се докаже
  // кой излиза; ако сървърът мълчи, локалният изход пак се извършва.
  try {
    if (getJwt() && await backendReady()) {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    }
  } catch (e) { /* без връзка — излизаме поне оттук */ }

  // Бележките са на излизащия акаунт — не остават за следващия.
  try {
    sessionStorage.removeItem('pa_iska_parola');
    sessionStorage.removeItem('pa_preduprezhdenie');
  } catch (e) { /* без хранилище */ }
  const lenta = document.getElementById('paPredupr');
  if (lenta) lenta.remove();

  setJwt(null);                 // изход и от истинския акаунт (ако има)
  state.user = null;
  saveState();
  switchProfile('guest');       // личният прогрес остава запазен в профила
  state.user = null;
  saveState();
  updateNav();
  toast('Излязохте от профила');
  location.hash = '#/';
}

async function purchaseSubject(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; toast('Първо влез в профила си'); return; }
  if (ownsSubject(id)) { toast('Вече притежаваш този пакет'); return; }

  // С работещ backend → истински Stripe Checkout (hosted страница)
  if (await backendReady() && getJwt()) {
    try {
      toast('Пренасочване към плащане…');
      const r = await apiFetch('/api/checkout/create-session', {
        method: 'POST',
        body: JSON.stringify({ packageId: id }),
      });
      window.location.href = r.data.checkoutUrl;
    } catch (err) {
      toast('⚠ Плащане: ' + err.message);
    }
    return;
  }

  // Без backend: демо checkout страницата
  location.hash = '#/mock-checkout?package=' + encodeURIComponent(id);
}

// Извиква се от бутона „Плати" на checkout страницата.
// При интеграция с истински Stripe: това става redirect към Stripe Checkout,
// а достъпът се дава от webhook-а на бекенда (checkout.session.completed).
function completeMockPurchase(id) {
  const subj = id === 'bundle'
    ? { id: 'bundle', name: 'Комплексен пакет — всички дисциплини' }
    : SUBJECTS.find(s => s.id === id);
  if (!subj) { toast('Пакетът не е намерен'); return; }
  if (ownsSubject(id)) { toast('Вече притежаваш този пакет'); location.hash = '#/dashboard'; return; }
  const btn = document.getElementById('mcPayBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Обработка…'; }
  setTimeout(() => {
    state.purchased.push(id);
    state.progress[id] = { topics: 0, cards: 0, lastSeen: Date.now() };
    // След покупка предметът е отключен — кешът с „няма достъп“ отпада.
    resetContentCache();
    invalidateCatalog();
    saveState();
    Activity.log('checkout.success', null, { packageId: id });
    toast('Успешна покупка: ' + subj.name, true);
    location.hash = '#/dashboard';
  }, 900);
}

// Checkout страница — резюме на поръчката + форма за карта (демо).
function renderMockCheckout(params) {
  const id = params.get('package');
  const subj = id === 'bundle'
    ? { id: 'bundle', name: 'Комплексен пакет — всички дисциплини', priceEUR: 165 }
    : SUBJECTS.find(s => s.id === id);
  if (!isLoggedIn()) { location.hash = '#/login'; toast('Първо влез в профила си'); return; }
  if (!subj) { location.hash = '#/packages'; return; }
  if (ownsSubject(id)) { location.hash = '#/dashboard'; toast('Вече притежаваш този пакет'); return; }
  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card" style="max-width:460px;">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-3);margin-bottom:6px;">Поръчка</div>
          <h2 style="margin-bottom:4px;">${escapeHtml(subj.name)}</h2>
          <p class="auth-sub">Еднократно плащане · lifetime достъп · обновления до 2027</p>
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:20px;">
            <span style="color:var(--text-2);">Общо с ДДС</span>
            <strong style="font-size:22px;">${subj.priceEUR || 35} € <span style="font-size:13px;font-weight:400;color:var(--text-2);">≈ ${eurToBgn(subj.priceEUR || 35)}</span></strong>
          </div>
          <form onsubmit="event.preventDefault(); completeMockPurchase('${id}');">
            <div class="field">
              <label>Номер на карта</label>
              <input class="input" inputmode="numeric" placeholder="4242 4242 4242 4242" required>
            </div>
            <div style="display:flex;gap:12px;">
              <div class="field" style="flex:1;">
                <label>Валидност</label>
                <input class="input" placeholder="ММ / ГГ" required>
              </div>
              <div class="field" style="flex:1;">
                <label>CVC</label>
                <input class="input" inputmode="numeric" placeholder="123" required>
              </div>
            </div>
            <button id="mcPayBtn" class="btn btn-gold btn-block btn-lg" style="margin-top:6px;">Плати ${subj.priceEUR || 35} € →</button>
          </form>
          <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:14px;">🔒 Демо режим — не се таксува истинска карта. В production плащането минава през Stripe.</p>
          <p style="font-size:10px;color:var(--text-3);margin-top:12px;line-height:1.5;border-top:1px solid var(--border);padding-top:10px;"><em>Настоящият курс съдържа авторски учебни материали, изготвени въз основа на самостоятелна творческа обработка на знания и научни източници. Всички права върху защитимото съдържание са запазени. Заплатената цена е цена за ограничен лиценз за лично ползване, а не за прехвърляне на авторски или други права.</em></p>
          <div class="auth-foot"><a href="#/packages">← Обратно към пакетите</a></div>
        </div>
      </div>
    </section>`;
}

// Тетрадка на грешките — преглед и преговор на сбърканите въпроси
function renderMistakes() {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const m = getMistakes();
  const subjIds = Object.keys(m).filter(sid => m[sid].length);
  const total = mistakesCount();

  const rows = subjIds.map(sid => {
    const subj = SUBJECTS.find(x => x.id === sid);
    const items = m[sid];
    return `
      <div class="card" style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:20px 22px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <strong style="color:var(--text-1);">${escapeHtml(subj ? subj.name : sid)}</strong>
            <span style="color:var(--text-2);font-size:13px;margin-left:8px;">${items.length} ${items.length === 1 ? 'грешка' : 'грешки'}</span>
          </div>
          <button class="btn btn-gold btn-sm" onclick="location.hash='#/mistakes-review/${sid}'">Преговори →</button>
        </div>
        <div style="margin-top:12px;">
          ${items.slice(0, 5).map(it => `
            <div style="padding:8px 0;border-top:1px solid var(--border);font-size:13px;color:var(--text-2);display:flex;justify-content:space-between;gap:10px;">
              <span style="flex:1;">${escapeHtml(it.q.slice(0, 90))}${it.q.length > 90 ? '…' : ''} ${it.times > 1 ? `<span style="color:var(--red);">×${it.times}</span>` : ''}</span>
              <a style="color:var(--text-3);cursor:pointer;white-space:nowrap;" onclick="clearMistake('${sid}', this.dataset.q); renderMistakes();" data-q="${escapeHtml(it.q)}">✓ знам я</a>
            </div>`).join('')}
          ${items.length > 5 ? `<div style="padding-top:8px;font-size:12px;color:var(--text-3);">… и още ${items.length - 5}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  $('#app').innerHTML = `
    <section class="page-head"><div class="container">
      <h1>📕 Тетрадка на грешките</h1>
      <p>${total ? `Имаш <strong>${total}</strong> ${total === 1 ? 'въпрос' : 'въпроса'} за преговор. Верен отговор при преговор маха въпроса от тетрадката.` : 'Празна е — сбърканите въпроси от тестовете ще се записват тук автоматично.'}</p>
    </div></section>
    <section style="padding:24px 0 64px;"><div class="container" style="max-width:760px;">
      ${total ? rows : `<div style="text-align:center;padding:40px;color:var(--text-2);">
        Реши няколко теста и се връщай тук. 📚
        <div style="margin-top:16px;"><a href="#/dashboard" class="btn btn-outline">Към таблото</a></div>
      </div>`}
    </div></section>`;
}

// Преговор на грешките за дадена дисциплина — мини тест само върху тях
function renderMistakesReview(sid) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const subj = SUBJECTS.find(x => x.id === sid);
  const items = (getMistakes()[sid] || []).filter(it => it.options && typeof it.correct === 'number');
  if (!subj || !items.length) { location.hash = '#/mistakes'; return; }

  let idx = 0, cleared = 0;

  function renderQ() {
    const live = (getMistakes()[sid] || []).filter(it => it.options && typeof it.correct === 'number');
    if (idx >= items.length || !live.length) {
      $('#app').innerHTML = `
        <section class="page-head"><div class="container">
          <h1>Преговорът завърши 🎯</h1>
          <p>Изчисти <strong>${cleared}</strong> от ${items.length} грешки по „${escapeHtml(subj.name)}".</p>
          <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
            <a href="#/mistakes" class="btn btn-gold">Към тетрадката</a>
            <a href="#/dashboard" class="btn btn-outline">Табло</a>
          </div>
        </div></section>`;
      return;
    }
    const q = items[idx];
    $('#app').innerHTML = `
      <section style="padding:32px 0 64px;"><div class="container" style="max-width:720px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
          <a href="#/mistakes" style="font-size:13px;color:var(--text-2);">← Тетрадката</a>
          <span style="font-size:13px;color:var(--text-2);">Въпрос ${idx + 1} / ${items.length} · сбъркан ×${q.times || 1}</span>
        </div>
        <div class="card" style="background:var(--paper);border:1px solid var(--border);border-radius:12px;padding:26px;">
          <h3 style="margin:0 0 18px;font-size:17px;color:var(--text-1);">${escapeHtml(q.q)}</h3>
          <div id="mrOptions">
            ${q.options.map((opt, oi) => `
              <button class="quiz-option" data-idx="${oi}" style="display:flex;gap:10px;width:100%;text-align:left;margin-bottom:8px;">
                <div class="quiz-letter">${bukvaOpcia(oi)}</div>
                <div>${escapeHtml(opt)}</div>
              </button>`).join('')}
          </div>
          <div id="mrResult"></div>
        </div>
      </div></section>`;

    $$('#mrOptions .quiz-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('answered')) return;
        const choice = parseInt(btn.dataset.idx);
        const ok = choice === q.correct;
        $$('#mrOptions .quiz-option').forEach((b, i) => {
          b.classList.add('answered');
          if (i === q.correct) b.classList.add('correct');
          else if (i === choice && !ok) b.classList.add('wrong');
          b.style.pointerEvents = 'none';
        });
        if (ok) { cleared++; clearMistake(sid, q.q); }
        else { recordMistake(sid, q); }
        $('#mrResult').innerHTML = `
          <div class="quiz-explain" style="margin-top:14px;">
            <strong>${ok ? '✓ Вярно — махната от тетрадката.' : '✗ Пак грешно — остава за преговор.'}</strong>
            ${q.explain ? ' ' + escapeHtml(q.explain) : ''}
          </div>
          <div style="margin-top:14px;text-align:right;">
            <button class="btn btn-gold" id="mrNext">${idx + 1 < items.length ? 'Следващ →' : 'Край'}</button>
          </div>`;
        $('#mrNext').onclick = () => { idx++; renderQ(); };
      });
    });
  }
  renderQ();
}

// Забравена парола: изпраща линк за нова парола по имейл (изисква backend)
function renderForgotPassword() {
  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card">
          <h2>Забравена парола</h2>
          <p class="auth-sub">Въведи имейла си — ще ти изпратим линк за нова парола.</p>
          <form onsubmit="event.preventDefault(); submitForgotPassword(this);">
            <div class="field">
              <label>Имейл</label>
              <input class="input" name="email" type="email" required placeholder="ivan@example.com">
            </div>
            <button class="btn btn-gold btn-block btn-lg" id="fpBtn">Изпрати линк</button>
          </form>
          <div id="fpResult" style="margin-top:14px;"></div>
          <div class="auth-foot"><a href="#/login">← Обратно към входа</a></div>
        </div>
      </div>
    </section>`;
}

async function submitForgotPassword(form) {
  const email = (form.querySelector('input[name="email"]')?.value || '').trim();
  const btn = document.getElementById('fpBtn');
  const out = document.getElementById('fpResult');
  btn.disabled = true; btn.textContent = 'Изпращане…';

  if (await backendReady()) {
    try {
      const r = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      out.innerHTML = '<p style="color:var(--green);font-size:14px;">✅ ' + escapeHtml(r.message || 'Ако този имейл има акаунт, изпратихме линк за нова парола.') + ' Провери и папка Спам.</p>';
    } catch (err) {
      out.innerHTML = '<p style="color:var(--red);font-size:14px;">⚠ ' + escapeHtml(err.message || 'Възникна грешка') + '</p>';
      btn.disabled = false; btn.textContent = 'Изпрати линк';
      return;
    }
  } else {
    const acc = LocalAuth.all()[email.toLowerCase()];
    if (!acc) {
      out.innerHTML = '<p style="color:var(--text-2);font-size:14px;">Ако този имейл има акаунт, ще получиш възможност за нова парола. (Няма локален акаунт с този имейл.)</p>';
    } else {
      out.innerHTML = '<p style="color:var(--text-2);font-size:14px;">ℹ Демо режим: смени паролата си направо тук.</p>' +
        '<div class="field" style="margin-top:8px;"><label>Нова парола</label><input class="input" id="fpNewPass" type="password" minlength="6" placeholder="минимум 6 символа"></div>' +
        '<button class="btn btn-gold btn-block" style="margin-top:10px;" id="fpDemoBtn">Запази новата парола</button>';
      const db = document.getElementById('fpDemoBtn');
      if (db) db.addEventListener('click', () => window.__fpDemoReset(email.toLowerCase()));
    }
  }
  btn.textContent = 'Продължи ✓';
}

window.__fpDemoReset = async function(email) {
  const inp = document.getElementById('fpNewPass');
  const pass = inp ? inp.value : '';
  if (!pass || pass.length < 6) { toast('⚠ Паролата трябва да е поне 6 символа'); return; }
  const ok = await LocalAuth.setPassword(email, pass);
  if (ok) {
    toast('✅ Паролата е сменена — влез с новата', true);
    location.hash = '#/login';
  } else { toast('⚠ Не намерих акаунта'); }
}

// Нова парола: отваря се от линка в имейла (#/reset-password?token=...)
function renderResetPassword(params) {
  const token = params.get('token');
  if (!token) {
    $('#app').innerHTML = `
      <section class="auth"><div class="container"><div class="auth-card">
        <h2>Невалиден линк</h2>
        <p class="auth-sub">Линкът за нова парола е невалиден или непълен.</p>
        <a href="#/forgot-password" class="btn btn-gold btn-block">Поискай нов линк</a>
      </div></div></section>`;
    return;
  }
  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card">
          <h2>Нова парола</h2>
          <p class="auth-sub">Въведи новата си парола (минимум 8 символа, букви и цифри).</p>
          <form id="rpForm">
            <div class="field">
              <label>Нова парола</label>
              <input class="input" name="password" type="password" required minlength="8" placeholder="••••••••" autocomplete="new-password">
            </div>
            <div class="field">
              <label>Повтори паролата</label>
              <input class="input" name="password2" type="password" required minlength="8" placeholder="••••••••" autocomplete="new-password">
            </div>
            <button class="btn btn-gold btn-block btn-lg" id="rpBtn">Запази новата парола</button>
          </form>
          <div id="rpResult" style="margin-top:14px;"></div>
          <div class="auth-foot"><a href="#/login">← Към входа</a></div>
        </div>
      </div>
    </section>`;

  // Токенът НЕ влиза в HTML — подава се на функцията през затварящ обхват.
  // Така съдържанието на ?token= никога не се тълкува като код.
  const f = document.getElementById('rpForm');
  if (f) f.addEventListener('submit', (e) => { e.preventDefault(); submitResetPassword(e.target, token); });
}

async function submitResetPassword(form, token) {
  const p1 = form.querySelector('input[name="password"]').value;
  const p2 = form.querySelector('input[name="password2"]').value;
  const out = document.getElementById('rpResult');
  const btn = document.getElementById('rpBtn');

  if (p1 !== p2) {
    out.innerHTML = '<p style="color:var(--red);font-size:14px;">⚠ Паролите не съвпадат.</p>';
    return;
  }
  btn.disabled = true; btn.textContent = 'Запазване…';

  if (!(await backendReady())) {
    out.innerHTML = '<p style="color:var(--text-2);font-size:14px;">ℹ Демо режим — няма свързан сървър.</p>';
    btn.disabled = false; btn.textContent = 'Запази новата парола';
    return;
  }
  try {
    await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: p1 }),
    });
    out.innerHTML = '<p style="color:var(--green);font-size:14px;">✅ Паролата е сменена! Пренасочваме те към входа…</p>';
    setTimeout(() => { location.hash = '#/login'; }, 1500);
  } catch (err) {
    out.innerHTML = '<p style="color:var(--red);font-size:14px;">⚠ ' + escapeHtml(err.message || 'Линкът може да е изтекъл — поискай нов.') + '</p>';
    btn.disabled = false; btn.textContent = 'Запази новата парола';
  }
}

// „Тегли билет" от търсачката водеше към несъществуващ route (#/exam → 404).
// Сега: избор на дисциплина за симулация на изпит.
function renderExamPicker() {
  if (!isLoggedIn()) { location.hash = '#/login'; toast('Първо влез в профила си'); return; }
  const owned = SUBJECTS.filter(s => ownsSubject(s.id));
  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card" style="max-width:520px;">
          <h2>Тегли билет — избери дисциплина</h2>
          <p class="auth-sub">Симулацията на изпит е достъпна за закупените ти пакети.</p>
          ${owned.length ? owned.map(s => `
            <a href="#/exam-draw/${s.id}" class="btn btn-outline btn-block" style="margin-bottom:10px;justify-content:space-between;display:flex;">
              <span>${escapeHtml(s.name)}</span><span>→</span>
            </a>`).join('') : `
            <p style="color:var(--text-2);margin-bottom:16px;">Все още нямаш закупени пакети.</p>
            <a href="#/packages" class="btn btn-gold btn-block">Разгледай пакетите →</a>`}
        </div>
      </div>
    </section>`;
}

export { LocalAuth, completeMockPurchase, login, logout, purchaseSubject, renderExamPicker, renderForgotPassword, renderMistakes, renderMistakesReview, renderMockCheckout, renderResetPassword, submitForgotPassword, submitResetPassword };
