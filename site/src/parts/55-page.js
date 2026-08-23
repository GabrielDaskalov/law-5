/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { $, escapeHtml, isLoggedIn, ownsSubject } from './10-helpers.js';
import { allNotesForSubject, deleteNote } from './18-feature.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Notes overview for a subject
   ============================================================================= */
function renderNotesForSubject(subjId) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === subjId);
  if (!s) return render404();
  if (!ownsSubject(subjId)) { location.hash = '#/subject/' + subjId; return; }

  const notes = allNotesForSubject(subjId);
  const byTopic = {};
  notes.forEach(n => { (byTopic[n.topicIdx] = byTopic[n.topicIdx] || []).push(n); });
  const topicIdxsWithNotes = Object.keys(byTopic).map(Number).sort((a, b) => a - b);

  $('#app').innerHTML = `
    <section class="page-head"><div class="container">
      <a href="#/subject/${subjId}" style="font-size:12px;color:var(--text-3);text-decoration:none;">← ${escapeHtml(s.name)}</a>
      <h1 style="margin-top:10px;">Моите бележки</h1>
      <p>${notes.length} ${notes.length === 1 ? 'бележка' : 'бележки'} в ${topicIdxsWithNotes.length} ${topicIdxsWithNotes.length === 1 ? 'тема' : 'теми'}.</p>
    </div></section>

    <section style="padding-bottom:80px;"><div class="container" style="max-width:900px;">
      ${notes.length === 0 ? `
        <div class="settings-card" style="text-align:center;padding:48px 24px;">
          <div style="font-size:48px;margin-bottom:12px;">📝</div>
          <h3>Все още нямаш бележки</h3>
          <p style="color:var(--text-2);margin-bottom:20px;">Отвори конспекта на дадена тема и натисни бутона „Добави бележка" под всеки раздел.</p>
          <a href="#/conspect/${subjId}" class="btn btn-gold">Отвори конспекта</a>
        </div>
      ` : topicIdxsWithNotes.map(ti => `
        <div class="notes-topic-block">
          <div class="notes-topic-head">
            <h3>${ti + 1}. ${escapeHtml(s.chapters[ti] || '')}</h3>
            <a href="#/conspect/${subjId}?chapter=${ti}" class="btn btn-outline btn-sm">Виж темата →</a>
          </div>
          ${byTopic[ti].map(n => `
            <div class="notes-item notes-color-${n.color || 'yellow'}">
              ${n.quote ? `<div class="notes-quote">„${escapeHtml(n.quote)}"</div>` : ''}
              <div class="notes-text">${escapeHtml(n.note)}</div>
              <div class="notes-meta">
                <span>${new Date(n.createdAt).toLocaleDateString('bg-BG')}</span>
                <button class="adm-btn-sm danger" onclick="window.__noteDel('${subjId}', ${ti}, '${n.id}')">Изтрий</button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div></section>`;
}
window.__noteDel = function (subjId, ti, noteId) {
  if (!confirm('Да изтрия ли бележката?')) return;
  deleteNote(subjId, ti, noteId);
  renderNotesForSubject(subjId);
};

export { renderNotesForSubject };
