/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { isAdmin } from './14-data-service.js';

/* =============================================================================
   HELPERS
   ============================================================================= */
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
// ВАЖНО: екранира и единичната кавичка. Без нея стойност, вмъкната в JS низ
// вътре в on*-атрибут, изнася кода навън (reflected XSS през ?token=).
/**
 * Буквите на опциите в тестовете. Кирилски, защото целият учебен материал
 * (и изпитът за юридическа правоспособност) ползва А/Б/В/Г. Държим ги на
 * едно място, за да не се разминава списъкът с опции от разбора след
 * отговора — там латинското „C" и кирилското „В" изглеждат почти еднакво
 * и разминаването остава невидимо за окото.
 */
const BUKVI_OPCII = 'АБВГДЕ';

function bukvaOpcia(i) { return BUKVI_OPCII[i] || String(i + 1); }

function escapeHtml(s) { return String(s).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c])); }

function toast(msg, gold = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (gold ? ' toast-gold' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 2400);
}

function isLoggedIn() { return !!state.user; }
function ownsSubject(id) {
  // Комплексният пакет отключва всички дисциплини
  if (state.purchased && state.purchased.includes('bundle')) return true;
  // Admin: full access to everything (no purchase needed)
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  return state.purchased.includes(id);
}
function progressOf(id) {
  const p = state.progress[id];
  if (!p) return 0;
  const subj = SUBJECTS.find(s => s.id === id);
  if (!subj) return 0;
  return Math.min(100, Math.round((p.topics / subj.topics) * 100));
}

function pillForYear(year) {
  return `<span class="pill pill-y${year}">${year} курс</span>`;
}

function ringSvg(percent, size = 60) {
  const r = (size / 2) - 5;
  const C = 2 * Math.PI * r;
  const offset = C - (percent / 100) * C;
  return `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring">
      <circle class="ring-track" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="5"/>
      <circle class="ring-fill" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="5"
              stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
              transform="rotate(-90 ${size/2} ${size/2})"/>
      <text x="${size/2}" y="${size/2 + 4}" text-anchor="middle" fill="#0F1B2D" font-size="${Math.round(size/4.5)}">${percent}%</text>
    </svg>
  `;
}

function updateNav() {
  const navActions = $('#navActions');
  const themeIcon = state.theme === 'dark'
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const themeBtn = '<button class="theme-toggle" onclick="toggleTheme()" title="Превключи тема">' + themeIcon + '</button>';
  if (isLoggedIn()) {
    const adminLink = (typeof isAdmin === 'function' && isAdmin())
      ? '<a href="#/admin" class="btn btn-ghost" title="Админ панел" style="color:var(--gold);">Админ</a>' : '';
    const searchBox = '<div class="nav-search"><input id="navSearchInput" type="search" placeholder="Търси във всичко..." onkeydown="if(event.key===\'Enter\')window.__navSearch()" /><button onclick="window.__navSearch()" aria-label="Търси">🔍</button></div>';
    const userMenu = '<div class="user-menu"><button class="btn btn-ghost user-menu-btn" onclick="toggleUserMenu(event)">' +
      escapeHtml((state.user.name || state.user.email || '').slice(0, 18)) +
      ' <span style="opacity:0.5;">▾</span></button>' +
      '<div class="user-menu-drop" id="userMenuDrop">' +
        '<a href="#/dashboard">Табло</a>' +
        '<a href="#/settings">Настройки</a>' +
        '<a href="#/support">Поддръжка</a>' +
        '<div class="user-menu-sep"></div>' +
        '<button onclick="logout()">Изход</button>' +
      '</div></div>';
    navActions.innerHTML = themeBtn + searchBox + adminLink + userMenu;
  } else {
    navActions.innerHTML = themeBtn +
      '<a href="#/login" class="btn btn-ghost">Вход</a>' +
      '<a href="#/register" class="btn btn-gold">Регистрация</a>';
  }
  const hash = location.hash || '#/';
  $$('#navLinks a').forEach(a => {
    a.classList.toggle('active', hash.startsWith(a.getAttribute('href')) && a.getAttribute('href') !== '#/');
  });
}

export { BUKVI_OPCII, bukvaOpcia, $, $$, el, escapeHtml, isLoggedIn, ownsSubject, pillForYear, progressOf, ringSvg, toast, updateNav };
