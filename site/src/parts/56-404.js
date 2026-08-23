/* Автоматично добавени връзки при разделянето на монолита. */
import { $ } from './10-helpers.js';

/* =============================================================================
   404
   ============================================================================= */
function render404() {
  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container" style="text-align:center;padding:80px 0;">
        <div class="serif" style="font-size:72px;color:var(--gold);margin-bottom:8px;">404</div>
        <h1>Страницата не е намерена</h1>
        <p style="margin:12px auto 24px;">Изглежда този адрес не съществува или вече не е достъпен.</p>
        <a href="#/" class="btn btn-gold">Към началната страница</a>
      </div>
    </section>
  `;
}

export { render404 };
