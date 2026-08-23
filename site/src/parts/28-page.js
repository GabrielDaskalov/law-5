/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { eurToBgn } from './08-tetradka-na-greshkite.js';
import { $, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';

/* =============================================================================
   PAGES — Packages
   ============================================================================= */
function renderPackages(yearFilter) {
  const year = yearFilter ? parseInt(yearFilter) : null;
  const filtered = year ? SUBJECTS.filter(s => s.year === year) : SUBJECTS;

  const bundleOwned = state.purchased.includes('bundle');
  const bundleCard = `
    <div class="pkg-card featured" style="border-color:var(--gold);">
      <span style="position:absolute;top:-11px;left:24px;background:var(--gold);color:var(--navy);padding:2px 12px;border-radius:999px;font-size:12px;font-weight:700;">Най-добра стойност</span>
      <div class="pkg-head"><span class="pkg-meta">Всички ${SUBJECTS.length} дисциплини</span></div>
      <div class="pkg-name">Комплексен пакет</div>
      <div class="pkg-sub">Пълен достъп до всяка дисциплина — конспекти, флашкарти, тестове, казуси.</div>
      <div class="pkg-features">
        <div class="pkg-feat">Всички настоящи и бъдещи материали</div>
        <div class="pkg-feat">Спестяваш стотици евро спрямо единични</div>
        <div class="pkg-feat">Lifetime достъп · обновления</div>
      </div>
      ${bundleOwned ? '' : `
      <div class="pkg-try-free" onclick="location.hash='#/packages'">
        💡 Или пробвай безплатно която и да е дисциплина по-долу
      </div>`}
      <div class="pkg-foot">
        <div>
          <div class="pkg-price">165 €</div>
          <div class="pkg-price-sub">≈ ${eurToBgn(165)} · еднократно</div>
        </div>
        ${bundleOwned
          ? `<a href="#/dashboard" class="pkg-owned">✓ Притежаваш</a>`
          : `<button class="btn btn-gold btn-sm" onclick="purchaseSubject('bundle')">Купи</button>`}
      </div>
    </div>`;

  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <span class="eyebrow">Пакети по дисциплини</span>
        <h1 style="margin-top:14px;">Избери своя пакет</h1>
        <p>Всички пакети съдържат лекции, конспект, флашкарти, тестове и персонален план за изпит. Купуваш веднъж — ползваш завинаги. <strong style="color:var(--gold-3);">🎁 Всяка дисциплина има 5 безплатни карти за проба.</strong></p>
      </div>
    </section>

    <section style="padding-bottom:80px;">
      <div class="container">
        <div class="packages-grid">
          ${bundleCard}
          ${filtered.map(s => packageCard(s)).join('')}
        </div>
        ${filtered.length === 0 ? '<p style="text-align:center;padding:48px;color:var(--text-3);">Няма пакети в тази категория.</p>' : ''}

        <div class="cta-band" style="background:var(--paper);border:0.5px solid var(--border);border-radius:var(--radius-l);padding:32px;margin-top:48px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;">
          <div>
            <h3 style="font-size:20px;margin-bottom:6px;">Комплексен пакет — всички дисциплини</h3>
            <p style="margin:0;color:var(--text-2);font-size:14px;">Спестяваш над 50 € при покупка на няколко дисциплини наведнъж. Включва избраните дисциплини, лекции, конспекти и сертификат за завършване.</p>
          </div>
          <div style="text-align:right;">
            <div class="serif" style="font-size:26px;color:var(--navy);font-weight:500;">от 165 €</div>
            <button class="btn btn-navy" style="margin-top:8px;" onclick="toast('Скоро — семестриални пакети')">Виж пакетите</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function packageCard(s) {
  const owned = ownsSubject(s.id);
  return `
    <div class="pkg-card ${s.featured ? 'featured' : ''}">
      <div class="pkg-head">
        <span class="pkg-meta">${s.topics} теми</span>
      </div>
      <div class="pkg-name">${escapeHtml(s.name)}</div>
      <div class="pkg-sub">${escapeHtml(s.tagline)}</div>
      <div class="pkg-features">
        ${s.lectures > 0 ? `<div class="pkg-feat">${s.lectures} видео-лекции</div>` : ''}
        ${s.cards > 0 ? `<div class="pkg-feat">${s.cards} флашкарти</div>` : ''}
        ${s.pages > 0 ? `<div class="pkg-feat">Конспект ${s.pages} стр.</div>` : ''}
        <div class="pkg-feat">Тестове и казуси</div>
      </div>
      ${owned ? '' : `
      <div class="pkg-try-free" onclick="tryFreeCards('${s.id}')">
        🎁 Пробвай 5 карти безплатно →
      </div>`}
      <div class="pkg-foot">
        <div>
          <div class="pkg-price">35 €</div>
          <div class="pkg-price-sub">≈ ${eurToBgn(35)} · еднократно</div>
        </div>
        ${owned
          ? `<a href="#/subject/${s.id}" class="pkg-owned">✓ Притежаваш</a>`
          : `<button class="btn btn-gold btn-sm" onclick="purchaseSubject('${s.id}')">Купи</button>`}
      </div>
    </div>
  `;
}

// Безплатна проба: логнат → директно към картите; гост → регистрация
function tryFreeCards(id) {
  if (!isLoggedIn()) {
    toast('Регистрирай се безплатно, за да пробваш картите');
    location.hash = '#/register';
    return;
  }
  location.hash = '#/flashcards/' + id;
}

export { packageCard, renderPackages, tryFreeCards };
