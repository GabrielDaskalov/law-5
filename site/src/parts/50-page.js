/* Автоматично добавени връзки при разделянето на монолита. */
import { $, escapeHtml } from './10-helpers.js';

/* =============================================================================
   PAGES — Pricing
   ============================================================================= */
function renderPricing() {
  $('#app').innerHTML = `
    <section class="page-head"><div class="container" style="text-align:center;">
      <span class="eyebrow">Пакети</span>
      <h1 style="margin-top:14px;">Избери своя пакет</h1>
      <p>Купуваш веднъж — ползваш завинаги. Включва обновления до края на 2027 г.</p>
    </div></section>

    <section style="padding-bottom:32px;"><div class="container">
      <div class="pricing-grid">
        <div class="pricing-card">
          <div class="pricing-badge"></div>
          <h3>Една дисциплина</h3>
          <div class="pricing-price">35 <span>€</span></div>
          <div class="pricing-sub">еднократно · с включен ДДС</div>
          <ul class="pricing-features">
            <li>✓ Пълен конспект по дисциплината</li>
            <li>✓ Флашкарти със SRS алгоритъм</li>
            <li>✓ 200-900 тестови въпроса</li>
            <li>✓ Казуси с пълни решения</li>
            <li>✓ Симулация на изпит „Тегли билет"</li>
            <li>✓ Lifetime достъп</li>
            <li>✓ Бъдещи обновления до 2027</li>
          </ul>
          <a href="#/packages" class="btn btn-outline" style="width:100%;">Виж дисциплините →</a>
        </div>

        <div class="pricing-card pricing-featured">
          <div class="pricing-badge">Най-добра стойност</div>
          <h3>Комплексен пакет</h3>
          <div class="pricing-price">165 <span>€</span></div>
          <div class="pricing-sub">няколко дисциплини наведнъж</div>
          <ul class="pricing-features">
            <li>✓ Избираш няколко дисциплини (от 5 нагоре)</li>
            <li>✓ Спестяваш над 50 € спрямо единични</li>
            <li>✓ Включва всички функции от „Една дисциплина"</li>
            <li>✓ Bonus: Учебен план до изпита</li>
            <li>✓ Lifetime достъп</li>
          </ul>
          <a href="#/packages" class="btn btn-gold" style="width:100%;">Купи комплексен пакет →</a>
        </div>

        <div class="pricing-card">
          <div class="pricing-badge"></div>
          <h3>Студентски разрешен</h3>
          <div class="pricing-price">−20<span>%</span></div>
          <div class="pricing-sub">за регистрирани студенти</div>
          <ul class="pricing-features">
            <li>✓ 20% отстъпка на всеки пакет</li>
            <li>✓ Изисква email от университет (.uni-sofia.bg, .uni-plovdiv.bg, .vtu.bg, .nbu.bg, и др.)</li>
            <li>✓ Автоматична верификация при регистрация</li>
            <li>✓ Important: важи само за студенти, обучаващи се в момента</li>
          </ul>
          <a href="#/register" class="btn btn-outline" style="width:100%;">Регистрирай се →</a>
        </div>
      </div>

      <div style="margin-top:48px;text-align:center;padding:32px;background:var(--paper);border:0.5px solid var(--border);border-radius:var(--radius-l);">
        <h3 style="font-family:var(--font-serif);margin-bottom:8px;">Първите 100 потребители — 30% отстъпка</h3>
        <p style="color:var(--text-2);margin-bottom:16px;">Промо код <code style="background:var(--bg-1);padding:4px 8px;border-radius:4px;color:var(--gold-3);font-weight:600;">EARLY100</code> на checkout. Само за 2026.</p>
      </div>
    </div></section>

    <section style="padding-bottom:80px;"><div class="container" style="max-width:680px;">
      <h2 style="text-align:center;font-family:var(--font-serif);margin-bottom:24px;">Често задавани въпроси за плащане</h2>
      ${[
        { q: 'Какви методи на плащане приемате?', a: 'Visa, Mastercard, Maestro, Apple Pay, Google Pay чрез Stripe. Сигурно SSL шифроване — данните на картата ти не минават през нашия сървър.' },
        { q: 'Мога ли да получа фактура?', a: 'Да. По email след плащане. Ако ти трябва фактура на фирма, въведи ДДС номер и фирмени данни на checkout.' },
        { q: 'Може ли по банков превод?', a: 'За пакети над 100 € — да. Пиши на info@pravo-academy.bg за инструкции.' },
        { q: 'Има ли скрити такси?', a: 'Не. Цената на checkout е финалната цена. ДДС е включен.' },
      ].map(f => `
        <details class="faq-item">
          <summary>${escapeHtml(f.q)}</summary>
          <div class="faq-answer">${escapeHtml(f.a)}</div>
        </details>`).join('')}
      <p style="text-align:center;margin-top:24px;"><a href="#/faq" style="color:var(--gold);">Виж всички въпроси →</a></p>
    </div></section>`;
}

export { renderPricing };
