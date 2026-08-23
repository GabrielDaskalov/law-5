/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { $, escapeHtml, isLoggedIn, ownsSubject } from './10-helpers.js';
import { searchAll } from './19-feature.js';

/* =============================================================================
   PAGES — Global Search
   ============================================================================= */
function renderSearch(queryStr) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const params = new URLSearchParams(queryStr || '');
  const q = (params.get('q') || '').trim();
  const type = params.get('type') || '';
  const subj = params.get('subj') || '';
  const { results, total } = q
    ? searchAll(q, { type, subject: subj, serverConspects: window.__searchConspects || null })
    : { results: [], total: 0 };

  // Group results by type + subject for cleaner display
  const byType = { conspect: [], flashcards: [], quiz: [], cases: [], notes: [] };
  results.forEach(r => { if (byType[r.type]) byType[r.type].push(r); });

  const typeLabels = { conspect: 'Конспект', flashcards: 'Флашкарти', quiz: 'Тестове', cases: 'Казуси', notes: 'Мои бележки' };
  const typeIcons = { conspect: '📖', flashcards: '🃏', quiz: '✓', cases: '⚖', notes: '📝' };

  const purchasedSubjects = SUBJECTS.filter(s => ownsSubject(s.id));

  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <a href="#/dashboard" style="font-size:12px;color:var(--text-3);text-decoration:none;">← Табло</a>
        <h1 style="margin-top:10px;">Търсене</h1>
        <div class="search-hero">
          <input id="searchBigInput" type="search" placeholder="Търси в конспект, карти, тестове, казуси, бележки..." value="${escapeHtml(q)}" autofocus />
          <button class="btn btn-gold" onclick="window.__searchGo()">Търси</button>
        </div>
        <div class="search-filters">
          <a href="#/search?q=${encodeURIComponent(q)}" class="chip ${!type ? 'active' : ''}">Всичко (${total})</a>
          ${Object.keys(byType).map(k => byType[k].length ? `<a href="#/search?q=${encodeURIComponent(q)}&type=${k}${subj ? '&subj=' + subj : ''}" class="chip ${type === k ? 'active' : ''}">${typeIcons[k]} ${typeLabels[k]} (${byType[k].length})</a>` : '').join('')}
        </div>
        <div class="search-filters">
          <a href="#/search?q=${encodeURIComponent(q)}${type ? '&type=' + type : ''}" class="chip ${!subj ? 'active' : ''}">Всички дисциплини</a>
          ${purchasedSubjects.map(s => `<a href="#/search?q=${encodeURIComponent(q)}${type ? '&type=' + type : ''}&subj=${s.id}" class="chip ${subj === s.id ? 'active' : ''}">${escapeHtml(s.name)}</a>`).join('')}
        </div>
      </div>
    </section>

    <section style="padding-bottom:80px;"><div class="container">
      ${!q ? `
        <div class="search-empty">
          <div style="font-size:56px;margin-bottom:12px;opacity:0.3;">🔍</div>
          <h3>Търси в цялото съдържание</h3>
          <p>Въведи ключова дума и системата ще намери всички съвпадения в конспекта, флашкартите, тестовете, казусите и твоите лични бележки.</p>
          ${(state.searchHistory || []).length ? `
            <div class="search-history">
              <div class="search-history-label">Последни търсения:</div>
              ${state.searchHistory.slice(0, 8).map(h => `<a href="#/search?q=${encodeURIComponent(h)}" class="chip">${escapeHtml(h)}</a>`).join('')}
            </div>` : ''}
          <div style="margin-top:24px;">
            <div class="search-history-label">Примери за търсене:</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
              ${['неустойка', 'evictio', 'привличане като обвиняем', 'чл. 87 ЗЗД', 'договор в полза на трето лице'].map(ex => `<a href="#/search?q=${encodeURIComponent(ex)}" class="chip">${escapeHtml(ex)}</a>`).join('')}
            </div>
          </div>
        </div>
      ` : results.length === 0 ? `
        <div class="search-empty">
          <div style="font-size:56px;margin-bottom:12px;opacity:0.3;">🤷</div>
          <h3>Няма резултати за „${escapeHtml(q)}"</h3>
          <p>Опитай с други ключови думи или премахни филтрите.</p>
        </div>
      ` : `
        <div class="search-results">
          ${results.map(r => `
            <a href="${escapeHtml(/^(#\/|https:\/\/)/.test(String(r.link || '')) ? r.link : '#')}" class="search-result">
              <div class="search-result-meta">
                <span class="search-result-type">${typeIcons[r.type]} ${typeLabels[r.type]}</span>
                <span class="search-result-subj">${escapeHtml(r.subj.name)}</span>
                <span class="search-result-topic">Тема: ${escapeHtml(r.topicTitle || '')}${r.sectionTitle ? ' · ' + escapeHtml(r.sectionTitle) : ''}</span>
              </div>
              <div class="search-result-snippet">${r.snippet}</div>
            </a>
          `).join('')}
        </div>
      `}
    </div></section>`;
}
window.__searchGo = function () {
  const inp = document.getElementById('searchBigInput');
  const q = inp ? inp.value.trim() : '';
  if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
};
window.__navSearch = function () {
  const inp = document.getElementById('navSearchInput');
  const q = inp ? inp.value.trim() : '';
  if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
};

export { renderSearch };
