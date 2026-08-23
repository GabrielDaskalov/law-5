/* Автоматично добавени връзки при разделянето на монолита. */
import { apiFetch } from './09-backend-integraciya.js';
import { $, escapeHtml } from './10-helpers.js';

/**
 * Причината, заради която човекът е изхвърлен — прочита се веднъж и се трие.
 *
 * Съобщението се показва при заявка, но заявката е последвана от връщане към
 * входа; съобщенията изчезват при пререгистриране на екрана. Затова се
 * пренася дотук и стои на видно място, докато човек не влезе пак.
 */
function prichinaZaIzhod() {
  try {
    const v = sessionStorage.getItem('pa_izhod_prichina');
    if (v) sessionStorage.removeItem('pa_izhod_prichina');
    return v || '';
  } catch (e) { return ''; }
}

/* =============================================================================
   PAGES — Login / Register
   ============================================================================= */
function renderLogin() {
  const prichina = prichinaZaIzhod();
  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card">
          <h2>Вход в акаунта</h2>
          <p class="auth-sub">Продължи там, където спря.</p>
          ${prichina ? `<div class="auth-izhod" role="status">${escapeHtml(prichina)}</div>` : ''}
          <form onsubmit="event.preventDefault(); authSubmit(this, 'login');">
            <div class="field">
              <label>Имейл</label>
              <input class="input" name="email" type="email" required placeholder="ivan@example.com">
            </div>
            <div class="field">
              <label>Парола</label>
              <input class="input" type="password" required placeholder="••••••••">
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:18px;">
              <label style="display:flex;align-items:center;gap:6px;color:var(--text-2);"><input type="checkbox"> Запомни ме</label>
              <a href="#/forgot-password" style="color:var(--gold-3);">Забравена парола?</a>
            </div>
            <button class="btn btn-gold btn-block btn-lg">Вход</button>
          </form>
          <div class="auth-foot">
            Нямаш акаунт? <a href="#/register">Регистрирай се</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Потвърждаване на ново устройство по код от имейла.
 *
 * Екранът е нарочно без вход: точно защото човекът НЕ може да влезе, е
 * получил този линк. Кодът от пощата е доказателството — тя е на собственика
 * на акаунта, а паролата сама по себе си вече не стига за ново устройство.
 */
function renderPotvardiUstrojstvo(params) {
  const kod = (params && (params.get('kod') || params.get('token'))) || '';

  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card">
          <h2>Ново устройство</h2>
          <p class="auth-sub">Потвърди, че това устройство е твое.</p>
          <div id="pdStatus" style="font-size:14px;color:var(--text-2);line-height:1.6;">Проверяваме кода…</div>
          <div id="pdBtn" style="margin-top:20px;"></div>
        </div>
      </div>
    </section>`;

  const stat = $('#pdStatus');
  const btn = $('#pdBtn');

  if (!kod) {
    stat.innerHTML = '<span style="color:#b45309;">Линкът е непълен. Отвори го направо от имейла, без да го преписваш.</span>';
    btn.innerHTML = '<a class="btn btn-outline" href="#/login">Към входа</a>';
    return;
  }

  apiFetch('/api/auth/confirm-device', { method: 'POST', body: JSON.stringify({ kod }) })
    .then((r) => {
      const ime = (r.data && r.data.ustrojstvo) || 'Устройството';
      stat.innerHTML = `<strong style="color:#15803d;">Готово.</strong> ${escapeHtml(ime)} вече е потвърдено —
        влез от него както обикновено.`;
      btn.innerHTML = '<a class="btn btn-gold btn-block btn-lg" href="#/login">Вход</a>';
    })
    .catch((e) => {
      stat.innerHTML = `<span style="color:#b45309;">${escapeHtml(e.message || 'Линкът не важи.')}</span>`;
      btn.innerHTML = '<a class="btn btn-outline" href="#/login">Опитай вход отново</a>';
    });
}

function renderRegister() {
  $('#app').innerHTML = `
    <section class="auth">
      <div class="container">
        <div class="auth-card">
          <h2>Създай акаунт</h2>
          <p class="auth-sub">Получи 5 безплатни карти от всяка дисциплина.</p>
          <form onsubmit="event.preventDefault(); authSubmit(this, 'register');">
            <div class="field">
              <label>Име</label>
              <input class="input" name="name" required placeholder="Иван Иванов">
            </div>
            <div class="field">
              <label>Имейл</label>
              <input class="input" name="email" type="email" required placeholder="ivan@example.com">
            </div>
            <div class="field">
              <label>Университет</label>
              <select class="select">
                <option>СУ "Св. Климент Охридски"</option>
                <option>ПУ "Паисий Хилендарски"</option>
                <option>НБУ</option>
                <option>УНСС</option>
                <option>Друг</option>
              </select>
            </div>
            <div class="field">
              <label>Парола</label>
              <input class="input" type="password" required placeholder="••••••••">
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2);margin-bottom:18px;">
              <input type="checkbox" required> Прочетох и приемам <a href="#/terms" style="color:var(--gold-3);">Общите условия</a> и се запознах с <a href="#/privacy" style="color:var(--gold-3);">Политиката за поверителност</a></label>
            <button class="btn btn-gold btn-block btn-lg">Създай акаунт</button>
          </form>
          <div class="auth-foot">
            Имаш акаунт? <a href="#/login">Вход</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

export { renderLogin, renderPotvardiUstrojstvo, renderRegister };
