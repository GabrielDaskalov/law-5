/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getCases } from './05-case-studies.js';
import { $, $$, escapeHtml, isLoggedIn, ownsSubject } from './10-helpers.js';
import { render404 } from './56-404.js';

import { loadCaseSolution } from '../lib/content.js';

/* =============================================================================
   PAGES — Cases (казуси — разработени)
   ============================================================================= */
function renderCases(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  const cases = getCases(id);
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const filterTopic = params.get('topic'); // chapter index as string

  // Group cases by topic chapter
  const byTopic = {};
  s.chapters.forEach((_, i) => { byTopic[i] = []; });
  cases.forEach(c => {
    const ti = (typeof c.topicIdx === 'number') ? c.topicIdx : 0;
    if (!byTopic[ti]) byTopic[ti] = [];
    byTopic[ti].push(c);
  });

  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <a href="#/subject/${id}" style="font-size:13px;color:var(--text-3);">← ${s.name}</a>
        <div style="display:flex;justify-content:space-between;align-items:end;flex-wrap:wrap;gap:16px;margin-top:8px;">
          <div>
            <span class="eyebrow">Казуси</span>
            <h1 style="margin-top:10px;">Разработени казуси по теми</h1>
            <p>${cases.length} казуса с факти, въпроси и пълно решение. Тренирай преди да видиш отговора.</p>
          </div>
          <div style="text-align:right;">
            <div class="serif" style="font-size:24px;color:var(--navy);font-weight:500;">${cases.length}</div>
            <div style="font-size:11px;color:var(--text-3);letter-spacing:0.06em;">${cases.length === 1 ? 'КАЗУС' : 'КАЗУСА'}</div>
          </div>
        </div>

        <div class="chip-row" style="margin-top:18px;">
          <a href="#/cases/${id}" class="chip ${!filterTopic ? 'active' : ''}" style="text-decoration:none;">Всички теми</a>
          ${s.chapters.map((ch, i) => byTopic[i] && byTopic[i].length > 0 ? `
            <a href="#/cases/${id}?topic=${i}" class="chip ${filterTopic === String(i) ? 'active' : ''}" style="text-decoration:none;">${i + 1}. ${escapeHtml(ch)} (${byTopic[i].length})</a>
          ` : '').join('')}
        </div>
      </div>
    </section>

    <section style="padding-bottom:80px;">
      <div class="container">
        ${s.chapters.map((ch, i) => {
          const list = byTopic[i];
          if (!list || list.length === 0) return '';
          if (filterTopic && filterTopic !== String(i)) return '';
          return `
            <div class="topic-section">
              <div class="topic-section-head">
                <h3>Тема ${i + 1} · ${escapeHtml(ch)}</h3>
                <span class="count">${list.length} ${list.length === 1 ? 'казус' : 'казуса'}</span>
              </div>
              <div class="case-list">
                ${list.map(c => caseCard(c, id, ch, cases.indexOf(c))).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;

  /* Бутонът „Покажи решението“.
     ПРОМЯНА: примерният отговор не идва заедно с казуса — тегли се едва
     когато студентът го поиска. Така решенията не стоят в страницата и не
     се четат от изходния код, преди човек да е помислил над задачата. */
  $$('.case-show-solution').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.case-card');
      const sol = card.querySelector('.case-solution');

      if (sol.style.display !== 'none') {
        sol.style.display = 'none';
        btn.textContent = 'Покажи решението';
        return;
      }

      const idx = Number(card.dataset.caseIdx);
      const kase = cases[idx];
      if (kase && (kase.solution === null || kase.solution === undefined)) {
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Зарежда…';
        try {
          await loadCaseSolution(kase);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = original;
          toast('⚠ Решението не се зареди. Опитай пак.');
          return;
        }
        btn.disabled = false;
        const body = sol.querySelector('.case-solution-body');
        if (body) {
          // Примерният отговор е номериран по въпросите — всеки абзац
          // отговаря на един въпрос, затова се разделя на абзаци.
          const abzaci = String(kase.solution || '')
            .split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
          body.innerHTML = abzaci.length
            ? abzaci.map(a => '<p class="kz-abzac">' + escapeHtml(a) + '</p>').join('')
            : '<p class="kz-abzac">За този казус още няма примерно решение.</p>';

          if (kase.conclusion) {
            const izvod = document.createElement('div');
            izvod.className = 'kz-blok';
            izvod.innerHTML = '<div class="kz-etiket">Кратък извод</div>' +
              '<div class="kz-izvod">' + escapeHtml(kase.conclusion) + '</div>';
            body.appendChild(izvod);
          }
          if (kase.mistakes && kase.mistakes.length) {
            const gr = document.createElement('div');
            gr.className = 'kz-blok kz-greshki';
            gr.innerHTML = '<div class="kz-etiket">Често срещани грешки</div>' +
              '<ul class="kz-spisak">' +
              kase.mistakes.map(m => '<li>' + escapeHtml(m) + '</li>').join('') + '</ul>';
            body.appendChild(gr);
          }
        }
      }

      sol.style.display = 'block';
      btn.textContent = 'Скрий решението';
    });
  });
}

const NIVA = { базово: 'Базово', средно: 'Средно', високо: 'Високо' };

/** Списък с точки — ползва се за понятията, целите, насоките и грешките. */
function spisak(zagl, redove, vid) {
  if (!redove || !redove.length) return '';
  const tag = vid === 'ol' ? 'ol' : 'ul';
  return `
    <div class="kz-blok">
      <div class="kz-etiket">${escapeHtml(zagl)}</div>
      <${tag} class="kz-spisak">${redove.map(x => '<li>' + escapeHtml(x) + '</li>').join('')}</${tag}>
    </div>`;
}

function caseCard(c, subjId, topicName, idx) {
  const nivo = NIVA[String(c.level || '').toLowerCase()] || c.level || '';
  const ponqtiq = (c.concepts || []).length
    ? `<div class="kz-chipove">${(c.concepts || []).map(x =>
        '<span class="kz-chip">' + escapeHtml(x) + '</span>').join('')}</div>`
    : '';

  return `
    <div class="case-card" data-case-idx="${idx}">
      <div class="case-card-head">
        <div style="flex:1;">
          <span class="case-card-topic">Тема ${c.topicIdx + 1}${topicName ? ' · ' + escapeHtml(topicName) : ''}</span>
          <div class="case-card-title" style="margin-top:6px;">Казус ${c.num} — ${escapeHtml(c.title)}</div>
        </div>
        ${nivo ? `<span class="kz-nivo kz-nivo-${escapeHtml(String(c.level || '').toLowerCase())}">${escapeHtml(nivo)}</span>` : ''}
      </div>

      ${c.theme ? `<div class="kz-podtema">${escapeHtml(c.theme)}</div>` : ''}
      ${ponqtiq}

      ${spisak('Учебни цели — студентът да може', (c.goals || []).map(g => g.replace(/^да\s+/i, 'да ')))}

      <div class="kz-blok">
        <div class="kz-etiket">Фактическа обстановка</div>
        <div class="kz-fakti">${escapeHtml(c.facts)}</div>
      </div>

      ${spisak('Въпроси', c.questions, 'ol')}

      ${(c.hints || []).length ? `
        <details class="kz-nasoki">
          <summary>Насоки за решаване</summary>
          <ul class="kz-spisak">${(c.hints || []).map(h => '<li>' + escapeHtml(h) + '</li>').join('')}</ul>
        </details>` : ''}

      <button class="btn btn-outline btn-sm case-show-solution">Покажи решението</button>
      <div class="case-solution" style="display:none;">
        <div class="kz-etiket kz-etiket-zlat">Примерен отговор</div>
        <div class="case-solution-body"></div>
      </div>
    </div>
  `;
}

export { caseCard, renderCases };
