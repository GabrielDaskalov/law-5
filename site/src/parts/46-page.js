/* Автоматично добавени връзки при разделянето на монолита. */
import { $, escapeHtml, isLoggedIn, toast } from './10-helpers.js';
import { API } from './15-api.js';

/* =============================================================================
   PAGES — Customer Support
   ============================================================================= */
function renderSupport() {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const tickets = state.supportTickets || [];
  $('#app').innerHTML = `
    <section class="page-head"><div class="container">
      <a href="#/dashboard" style="font-size:13px;color:var(--text-3);text-decoration:none;">← Табло</a>
      <h1 style="margin-top:10px;">Поддръжка</h1>
      <p>Имаш проблем, въпрос или предложение? Пиши ни. Отговаряме в рамките на 24 часа в работни дни.</p>
    </div></section>

    <section style="padding-bottom:80px;"><div class="container" style="max-width:780px;">

      <div class="settings-card">
        <h3>Нов тикет</h3>
        <div class="settings-field">
          <label>Заглавие</label>
          <input id="ticSubj" type="text" placeholder="Кратко описание на проблема">
        </div>
        <div class="settings-field">
          <label>Подробно описание</label>
          <textarea id="ticBody" rows="6" placeholder="Опиши какво се случва, какво си очаквал и какво се е случило вместо това. Ако има грешка — копирай я тук."></textarea>
        </div>
        <button class="btn btn-gold" onclick="window.__ticSend()">📨 Изпрати тикет</button>
      </div>

      <div class="settings-card">
        <h3>Моите тикети <span style="color:var(--text-3);font-weight:400;font-size:13px;">${tickets.length}</span></h3>
        ${tickets.length === 0
          ? '<p style="color:var(--text-3);font-size:13px;">Все още нямаш изпратени тикети.</p>'
          : tickets.map(t => `
            <div class="ticket-row">
              <div class="ticket-row-head">
                <strong>${escapeHtml(t.subject)}</strong>
                <span class="ticket-status status-${t.status}">${t.status === 'open' ? 'отворен' : (t.status === 'replied' ? 'отговорено' : 'затворен')}</span>
              </div>
              <div class="ticket-row-meta">${new Date(t.createdAt).toLocaleDateString('bg-BG')} · ${new Date(t.createdAt).toLocaleTimeString('bg-BG').slice(0,5)}</div>
              <div class="ticket-row-body">${escapeHtml(t.body)}</div>
              ${t.replies && t.replies.length ? t.replies.map(r => `
                <div class="ticket-reply">
                  <div class="ticket-reply-head"><strong>${r.from === 'admin' ? 'Поддръжка' : 'Ти'}</strong> · ${new Date(r.at).toLocaleDateString('bg-BG')}</div>
                  <div>${escapeHtml(r.body)}</div>
                </div>`).join('') : ''}
            </div>`).join('')}
      </div>

      <div class="settings-card">
        <h3>Бързи отговори</h3>
        <p style="font-size:13px;color:var(--text-2);">Преди да пишеш тикет, виж дали въпросът ти не е в често задаваните: <a href="#/faq" style="color:var(--gold);">Често задавани въпроси →</a></p>
      </div>

      <div class="settings-card">
        <h3>Директен контакт</h3>
        <p style="font-size:13px;color:var(--text-2);line-height:1.7;">
          📧 <strong>support@pravo-academy.bg</strong><br>
          📞 За спешни въпроси относно плащане: <strong>+359 88 XXX XXXX</strong> (работно време 9–18, делнични дни)<br>
          Очаквай отговор в рамките на 24 часа в работни дни.
        </p>
      </div>

    </div></section>`;
}
window.__ticSend = async function() {
  const subject = document.getElementById('ticSubj').value.trim();
  const body = document.getElementById('ticBody').value.trim();
  try { await API.createSupportTicket({ subject, body }); toast('Тикетът е изпратен', true); renderSupport(); }
  catch(e){ toast(e.message); }
};

export { renderSupport };
