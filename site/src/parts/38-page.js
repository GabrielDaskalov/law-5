/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getFlashcards } from './01-seed.js';
import { getConspect, highlightGlossary } from './04-glossary.js';
import { getQuiz } from './05-case-studies.js';
import { isBookmarked } from './08-tetradka-na-greshkite.js';
import { saveState } from './09-backend-integraciya.js';
import { $, $$, bukvaOpcia, el, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';
import { isTopicDone, markTopicDone, markTopicUndone, recordActivity, setLastTopic, topicsDoneCount } from './11-topic-progress-streak-theme.js';
import { isAdmin } from './14-data-service.js';
import { getVideo, markVideoWatched, setVideo, videoEmbedUrl, videoIsEmbed } from './16-feature.js';
import { getTopicProgress, updateTopicProgress } from './17-feature.js';
import { addNote, deleteNote, getNotes } from './18-feature.js';
import { router } from './25-router.js';
import { aiBubbleHTML, setupAIBubble } from './33-ai-asistent-v2.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Conspect
   ============================================================================= */
function renderConspect(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  // Latin: use dedicated dictionary renderer
  if (id === 'lat') { return renderLatinDict(id, s); }

  const chapters = getConspect(id);
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  let activeIdx = parseInt(params.get('chapter'));
  if (isNaN(activeIdx) || activeIdx < 0 || activeIdx >= chapters.length) {
    activeIdx = (typeof state.lastTopic[id] === 'number') ? state.lastTopic[id] : 0;
  }
  if (activeIdx >= chapters.length) activeIdx = 0;
  setLastTopic(id, activeIdx);
  recordActivity();
  saveState();

  const ch = chapters[activeIdx];
  const done = isTopicDone(id, activeIdx);
  const totalDone = topicsDoneCount(id);
  const pctTopics = Math.round((totalDone / chapters.length) * 100);

  // Parse content into modular sections
  const sections = [];
  if (Array.isArray(ch.sections)) {
    // NEW full-content format: theme has document sections with blocks
    const icons = ['sparkle', 'lightbulb', 'list', 'book', 'flag'];
    ch.sections.forEach((sec, si) => {
      // Estimate reading time from block content
      const chars = (sec.blocks || []).reduce((a, b) => a + (b.text ? b.text.length : 0) + (b.items ? b.items.join('').length : 0), 0);
      const mins = Math.max(1, Math.round(chars / 900));
      sections.push({
        kind: 'blocks',
        icon: icons[si % icons.length],
        title: sec.title || ('Раздел ' + (si + 1)),
        blocks: sec.blocks || [],
        time: mins + ' мин',
        expanded: si < 2,
      });
    });
    // Препратки към закона from refs
    if (ch.refs && ch.refs.length) {
      sections.push({ kind: 'refs', icon: 'book', title: 'Препратки към законови текстове', content: 'Релевантни разпоредби: ' + ch.refs.join(', '), time: '1 мин', expanded: false });
    }
  } else {
    // LEGACY summary format: paragraphs[] + highlight
    const paras = ch.paragraphs || [];
    if (paras[0] && typeof paras[0] === 'string' && paras[0].indexOf('|||') === -1) {
      sections.push({ kind: 'summary', icon: 'sparkle', title: 'Кратко резюме', content: paras[0], time: '1 мин', expanded: true });
    }
    const defs = paras.filter((p, i) => i > 0 && typeof p === 'string' && p.indexOf('|||') === -1);
    if (defs.length > 0) {
      sections.push({ kind: 'def', icon: 'lightbulb', title: 'Основни понятия и дефиниции', content: defs.join(' '), time: '2 мин', expanded: true });
    }
    const listPara = paras.find(p => typeof p === 'string' && p.indexOf('|||') !== -1);
    if (listPara) {
      const parts = listPara.split('|||');
      const head = parts.shift();
      sections.push({ kind: 'list', icon: 'list', title: head || 'Ключови елементи', items: parts, time: '2 мин', expanded: false });
    }
    if (ch.highlight) {
      sections.push({ kind: 'refs', icon: 'book', title: 'Препратки към законови текстове', content: ch.highlight, time: '1 мин', expanded: false });
    }
  }
  // Section 5 — Бележки за изпита
  sections.push({ kind: 'tip', icon: 'flag', title: 'Бележки за изпита', content: 'Тази тема често се пада на изпит. Концентрирай се върху определенията, отграниченията от съседни институти и поне един пример от съдебната практика. Препоръчителна последователност: резюме → основни понятия → флашкарти → мини тест.', time: '1 мин', expanded: false });
  // Section 6 — Чести грешки
  sections.push({ kind: 'mistake', icon: 'warn', title: 'Чести грешки', content: 'Студентите често смесват тази тема със съседни институти. Внимавай при изпита да правиш ясно отграничение и да цитираш точните разпоредби. Не залагай на наизустяване — изпитващите обичат хипотетични казуси.', time: '1 мин', expanded: false });

  // Get related flashcards for this topic
  const allCards = getFlashcards(id) || [];
  const themeCards = allCards.filter(c => c.topic === ch.heading).slice(0, 4);

  // Get mini-quiz for this topic
  const allQuiz = getQuiz(id) || [];
  const themeQuiz = allQuiz.filter(q => q.topicIdx === activeIdx).slice(0, 2);

  if (themeCards.length) sections.push({ kind: 'cards', icon: 'cards', title: 'Флашкарти по темата', cards: themeCards, time: '3 мин', expanded: false });
  if (themeQuiz.length) sections.push({ kind: 'quiz', icon: 'check', title: 'Мини тест', items: themeQuiz, time: '2 мин', expanded: false });

  const sectionIcon = (k) => ({
    sparkle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l1.5 5L18 9.5 13.5 11 12 16l-1.5-5L6 9.5 10.5 8z"/></svg>',
    lightbulb: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.7 1 1.5 1 2.3v1h6v-1c0-.8.3-1.6 1-2.3A7 7 0 0 0 12 2z"/></svg>',
    list: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/></svg>',
    book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 4.5v15a1.5 1.5 0 0 1 1.5-1.5H20V3H5.5A1.5 1.5 0 0 0 4 4.5z"/></svg>',
    flag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 21V4h11l-2 4 2 4H4"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l10 18H2zM12 9v5M12 18v.01"/></svg>',
    cards: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h14v14"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>',
  }[k] || '');

  $('#app').innerHTML = `
    <section style="padding:24px 0 64px;background:var(--off-white);min-height:calc(100vh - 68px);">
      <div class="container">
        <a href="#/subject/${id}" style="font-size:13px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px;">← ${s.name}</a>

        <div class="tp-hero" style="margin-top:14px;">
          <div style="font-size:11px;color:var(--gold);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Тема ${activeIdx + 1} от ${chapters.length}</div>
          <h1>${escapeHtml(ch.heading)}</h1>
              <div class="tp-hero-actions">
                <button class="tp-act" id="bmBtn" onclick="toggleBookmark('${id}', ${activeIdx})">${isBookmarked(id, activeIdx) ? '★ Отбелязана' : '☆ Отбележи темата'}</button>
                <button class="tp-act" onclick="window.print()">🖨 Печат / PDF</button>
                <button class="tp-act" onclick="copyTopicLink()">🔗 Копирай линк</button>
              </div>
          <div class="tp-meta">
            <span>${sections.length} модула</span>
            <span>≈ ${sections.reduce((a, x) => a + parseInt(x.time) || 0, 0)} мин общо</span>
            <span>${themeCards.length} флашкарти</span>
            <span>${themeQuiz.length ? themeQuiz.length + ' въпроса в мини теста' : 'няма мини тест'}</span>
          </div>
          <div class="tp-progress">
            <div class="tp-progress-row">
              <span>Прогрес по дисциплината</span>
              <span><strong style="color:var(--gold);">${totalDone}</strong> / ${chapters.length} теми завършени · ${pctTopics}%</span>
            </div>
            <div class="tp-progress-bar"><div class="tp-progress-fill" style="width:0%;" id="hpb"></div></div>
          </div>
        </div>

        <div class="cons-grid" style="gap:20px;">
          <aside class="cons-toc">
            <h4>Програма</h4>
            <input class="input" type="text" placeholder="Търси тема…" style="margin-bottom:10px;font-size:13px;padding:8px 10px;"
              oninput="(function(q,el){ el.closest('.cons-toc').querySelectorAll('a').forEach(a => { a.style.display = a.textContent.toLowerCase().includes(q) ? '' : 'none'; }); })(this.value.toLowerCase(), this)">
            ${chapters.map((c, i) => {
              // If heading already starts with "N." (e.g. from PDF extraction), don't double-number
              const alreadyNumbered = /^\s*\d+\./.test(c.heading);
              const label = alreadyNumbered ? c.heading : ((i + 1) + '. ' + c.heading);
              return `
              <a href="#/conspect/${id}?chapter=${i}" class="${i === activeIdx ? 'active' : ''}" style="display:flex;align-items:center;gap:8px;">
                ${isTopicDone(id, i) ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0;"></span>' : '<span style="width:6px;height:6px;border-radius:50%;background:var(--neutral-bg);flex-shrink:0;"></span>'}
                <span style="flex:1;">${escapeHtml(label)}</span>
              </a>
              `;
            }).join('')}
          </aside>

          <div class="protected-content">

            ${(function () {
              // === VIDEO PLAYER (if available for this topic) ===
              const video = getVideo(id, activeIdx);
              if (video && video.url) {
                const embedUrl = videoEmbedUrl(video.url);
                const isEmbed = videoIsEmbed(video.url);
                return `
                  <div class="tp-video">
                    <div class="tp-video-head">
                      <span class="tp-video-icon">▶</span>
                      <strong>Видео обяснение</strong>
                      ${video.duration ? `<span class="tp-video-dur">${escapeHtml(video.duration)}</span>` : ''}
                      ${video.watched ? '<span class="tp-video-watched">✓ гледано</span>' : ''}
                    </div>
                    <div class="tp-video-wrap">
                      ${isEmbed
                        ? `<iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
                        : `<video controls src="${embedUrl}" onended="window.__videoEnded('${id}', ${activeIdx})"></video>`}
                    </div>
                    ${!video.watched ? `<div class="tp-video-mark"><button class="btn btn-outline btn-sm" onclick="window.__videoMarkWatched('${id}', ${activeIdx})">Маркирай като гледано</button></div>` : ''}
                  </div>
                `;
              }
              // Admin can add video from here
              if (isAdmin()) {
                return `
                  <div class="tp-video tp-video-empty">
                    <div class="tp-video-head"><span class="tp-video-icon">▶</span> <strong>Няма добавено видео</strong></div>
                    <p style="color:var(--text-3);font-size:13px;margin:8px 0 12px;">Като админ можеш да добавиш видео обяснение за тази тема.</p>
                    <button class="btn btn-outline btn-sm" onclick="window.__videoAdd('${id}', ${activeIdx})">+ Добави видео (YouTube / Vimeo / MP4)</button>
                  </div>
                `;
              }
              return '';
            })()}

            <!-- === LEARNING PATH — ACTIVITY CHECKLIST === -->
            ${(function () {
              const prog = getTopicProgress(id, activeIdx);
              const hasVideo = !!getVideo(id, activeIdx);
              const items = [
                { key: 'conspect', label: 'Прочети конспекта', icon: '📖', done: !!prog.conspect, link: '#' },
                hasVideo ? { key: 'video', label: 'Гледай видеото', icon: '▶', done: !!prog.video, link: '#' } : null,
                { key: 'flashcards', label: 'Флашкарти', icon: '🃏', done: !!prog.flashcards, link: '#/flashcards/' + id + '?topic=' + activeIdx },
                { key: 'quiz', label: 'Реши тест', icon: '✓', done: !!prog.quiz, link: '#/quiz/' + id },
                { key: 'cases', label: 'Прегледай казуси', icon: '⚖', done: !!prog.cases, link: '#/cases/' + id + '?topic=' + activeIdx },
              ].filter(Boolean);
              const doneCount = items.filter(x => x.done).length;
              return `
                <div class="tp-path">
                  <div class="tp-path-head">
                    <strong>Твоят път през темата</strong>
                    <span>${doneCount} / ${items.length} завършени</span>
                  </div>
                  <div class="tp-path-items">
                    ${items.map(it => `
                      <div class="tp-path-item ${it.done ? 'done' : ''}" onclick="window.__pathToggle('${id}', ${activeIdx}, '${it.key}', ${!it.done})">
                        <span class="tp-path-check">${it.done ? '✓' : ''}</span>
                        <span class="tp-path-icon">${it.icon}</span>
                        <span class="tp-path-label">${it.label}</span>
                        ${it.link !== '#' ? `<a href="${it.link}" class="tp-path-link" onclick="event.stopPropagation();">→</a>` : ''}
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            })()}

            ${sections.map((sec, si) => {
              const isExpanded = sec.expanded;
              return `
                <div class="tp-section ${isExpanded ? 'expanded' : ''}" data-sec="${si}">
                  <div class="tp-section-head" onclick="toggleSection(this)">
                    <div class="tp-section-icon">${sectionIcon(sec.icon)}</div>
                    <div class="tp-section-title">${escapeHtml(sec.title)}</div>
                    <div class="tp-section-meta">${escapeHtml(sec.time)}</div>
                    <div class="tp-section-chevron">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </div>
                  <div class="tp-section-body">
                    ${sec.kind === 'blocks' ? (sec.blocks || []).map(b => {
                      // Конспектът има три вида блокове: абзац, списък и
                      // подзаглавие. Досега подзаглавията се рисуваха като
                      // обикновен абзац и дългите теми вървяха без стъпала.
                      if (b.t === 'list') return '<ul>' + (b.items || []).map(it => '<li>' + escapeHtml(it) + '</li>').join('') + '</ul>';
                      if (b.t === 'h') return '<h4 class="tp-podzagl">' + escapeHtml(b.text || '') + '</h4>';
                      return '<p>' + escapeHtml(b.text || '') + '</p>';
                    }).join('') : ''}
                    ${sec.kind === 'list' ? '<ul>' + sec.items.map(it => '<li>' + escapeHtml(it) + '</li>').join('') + '</ul>' : ''}
                    ${sec.kind === 'cards' ? '<div class="tp-mini-fc">' + sec.cards.map((c, ci) => '<div class="tp-mini-fc-card" onclick="this.classList.toggle(\u0027flipped\u0027)"><div class="fc-mini-q">' + escapeHtml(c.q) + '</div><div class="fc-mini-hint">Натисни за отговор</div><div class="fc-mini-a">' + escapeHtml(c.a || '') + '</div></div>').join('') + '</div><div style="margin-top:14px;"><a href="#/flashcards/' + id + '" class="btn btn-outline btn-sm">Виж всички карти →</a></div>' : ''}
                    ${sec.kind === 'quiz' ? renderInlineQuiz(sec.items, id) : ''}
                    ${sec.kind === 'refs' ? '<div class="law-ref">' + escapeHtml(sec.content) + '</div>' : ''}
                    ${sec.kind === 'tip' || sec.kind === 'mistake' ? '<div class="exam-tip"><strong>' + (sec.kind === 'tip' ? 'Съвет: ' : 'Внимавай: ') + '</strong>' + escapeHtml(sec.content) + '</div>' : ''}
                    ${(sec.kind === 'summary' || sec.kind === 'def') ? '<p>' + escapeHtml(sec.content) + '</p>' : ''}
                  </div>
                </div>
              `;
            }).join('')}

            <!-- === PERSONAL NOTES === -->
            ${(function () {
              const notes = getNotes(id, activeIdx);
              return `
                <div class="tp-notes">
                  <div class="tp-notes-head">
                    <strong>📝 Мои бележки</strong>
                    <span>${notes.length} ${notes.length === 1 ? 'бележка' : 'бележки'}</span>
                  </div>
                  <div class="tp-notes-add">
                    <textarea id="noteText" placeholder="Добави лична бележка за тази тема — цитат, коментар, връзка с друга тема..." rows="2"></textarea>
                    <div class="tp-notes-actions">
                      <div class="tp-notes-colors">
                        ${['yellow','blue','green','pink'].map(c => `<button class="tp-color tp-color-${c} ${c === 'yellow' ? 'active' : ''}" data-color="${c}" onclick="window.__noteColor(this)"></button>`).join('')}
                      </div>
                      <button class="btn btn-gold btn-sm" onclick="window.__noteAdd('${id}', ${activeIdx})">Запази бележка</button>
                    </div>
                  </div>
                  ${notes.length ? '<div class="tp-notes-list">' + notes.map(n => `
                    <div class="tp-note tp-note-${n.color || 'yellow'}">
                      ${n.quote ? `<div class="tp-note-quote">„${escapeHtml(n.quote)}"</div>` : ''}
                      <div class="tp-note-text">${escapeHtml(n.note)}</div>
                      <div class="tp-note-meta">
                        <span>${new Date(n.createdAt).toLocaleDateString('bg-BG')}</span>
                        <button onclick="window.__noteDelInline('${id}', ${activeIdx}, '${n.id}')" title="Изтрий">✕</button>
                      </div>
                    </div>
                  `).join('') + '</div>' : ''}
                  ${notes.length > 0 ? `<div style="margin-top:10px;text-align:right;"><a href="#/notes/${id}" style="font-size:13px;color:var(--gold);">Виж всички бележки за дисциплината →</a></div>` : ''}
                </div>
              `;
            })()}

            <div class="tp-actions">
              <div class="tp-status">
                <span class="check ${done ? 'done' : ''}" id="topicCheck" onclick="toggleTopicDone('${id}', ${activeIdx})" title="Маркирай като завършена">${done ? '✓' : ''}</span>
                <span>${done ? 'Темата е завършена' : 'Маркирай темата като завършена'}</span>
              </div>
              <div class="tp-actions-btns">
                ${activeIdx > 0
                  ? '<a href="#/conspect/' + id + '?chapter=' + (activeIdx - 1) + '" class="btn btn-outline btn-sm">← Предишна</a>'
                  : ''}
                ${activeIdx < chapters.length - 1
                  ? '<a href="#/conspect/' + id + '?chapter=' + (activeIdx + 1) + '" class="btn btn-gold">Следваща тема →</a>'
                  : '<span class="btn btn-gold" onclick="toast(\u0027Стигна до края на материала! 🎓\u0027, true)">🎓 Завършена дисциплина</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  setTimeout(() => { const b = $('#hpb'); if (b) b.style.width = pctTopics + '%'; }, 80);
  // Highlight glossary terms in the section bodies (skip in Latin dict which has its own renderer)
  setTimeout(() => {
    $$('.tp-section-body').forEach(el => highlightGlossary(el));
  }, 50);
  // Auto-mark conspect as "read" after the user has been on the page for a few seconds
  setTimeout(() => { updateTopicProgress(id, activeIdx, 'conspect', true); }, 3000);

  // Append AI bubble
  const bubbleWrap = document.createElement('div');
  bubbleWrap.innerHTML = aiBubbleHTML();
  while (bubbleWrap.firstChild) document.body.appendChild(bubbleWrap.firstChild);
  setupAIBubble();
}

/* Latin dictionary — dedicated simple renderer (bypasses section machinery) */
function renderLatinDict(id, s) {
  const chapters = (window.PA_DATA && window.PA_DATA.conspectFull && window.PA_DATA.conspectFull.lat) || [];
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  let activeIdx = parseInt(params.get('chapter'));
  if (isNaN(activeIdx) || activeIdx < 0 || activeIdx >= chapters.length) {
    activeIdx = (typeof state.lastTopic[id] === 'number') ? state.lastTopic[id] : 0;
  }
  if (activeIdx >= chapters.length) activeIdx = 0;
  setLastTopic(id, activeIdx);
  recordActivity();
  saveState();

  const ch = chapters[activeIdx] || { heading: '(празно)', sections: [] };
  const searchQuery = (params.get('q') || '').trim().toLowerCase();

  // Collect all vocab items from all list blocks in all sections
  let items = [];
  (ch.sections || []).forEach(sec => {
    (sec.blocks || []).forEach(b => {
      if (b.t === 'list' && Array.isArray(b.items)) items.push(...b.items);
    });
  });

  if (searchQuery) {
    items = items.filter(it => it.toLowerCase().indexOf(searchQuery) !== -1);
  }

  const totalTerms = items.length;

  $('#app').innerHTML = `
    <section style="padding:24px 0 64px;background:var(--off-white);min-height:calc(100vh - 68px);">
      <div class="container">
        <a href="#/subject/${id}" style="font-size:13px;color:var(--text-3);display:inline-flex;align-items:center;gap:6px;">← ${escapeHtml(s.name)}</a>
        <div style="margin-top:14px;background:var(--paper);border-radius:16px;padding:28px 32px;border:0.5px solid var(--border);">
          <div style="font-size:11px;color:var(--gold);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Раздел ${activeIdx + 1} от ${chapters.length}</div>
          <h1 style="margin:0;font-size:26px;font-family:'Playfair Display',serif;color:var(--navy);">${escapeHtml(ch.heading || '')}</h1>
          <div style="margin-top:8px;color:var(--text-2);font-size:14px;">Латинско-български речник · ${totalTerms} термина</div>
        </div>

        <div class="cons-grid" style="gap:20px;margin-top:20px;">
          <aside class="cons-toc" style="background:var(--paper);border:0.5px solid var(--border);border-radius:14px;padding:16px 12px;">
            <h4 style="margin:0 0 12px 6px;font-size:12px;color:var(--text-3);letter-spacing:0.08em;text-transform:uppercase;">Раздели</h4>
            ${chapters.map((c, i) => `
              <a href="#/conspect/${id}?chapter=${i}" style="display:block;padding:9px 12px;border-radius:8px;text-decoration:none;font-size:13px;color:${i === activeIdx ? 'var(--navy)' : 'var(--text-2)'};background:${i === activeIdx ? 'var(--gold-bg-2)' : 'transparent'};font-weight:${i === activeIdx ? '500' : '400'};margin-bottom:2px;">${escapeHtml(c.heading || '')}</a>
            `).join('')}
          </aside>
          <div>
            <div style="background:var(--paper);border:0.5px solid var(--border);border-radius:14px;padding:20px 24px;margin-bottom:16px;">
              <input type="text" id="latSearch" placeholder="Търси дума или превод..." value="${escapeHtml(searchQuery)}" style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:10px;font-size:15px;">
            </div>
            <div style="background:var(--paper);border:0.5px solid var(--border);border-radius:14px;overflow:hidden;">
              ${totalTerms === 0 ? `
                <div style="padding:40px;text-align:center;color:var(--text-3);">
                  ${searchQuery ? 'Няма съвпадения за „' + escapeHtml(searchQuery) + '".' : 'Няма записи в този раздел.'}
                </div>
              ` : `
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                  <thead>
                    <tr style="background:var(--off-white);">
                      <th style="text-align:left;padding:12px 18px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);width:1%;white-space:nowrap;">№</th>
                      <th style="text-align:left;padding:12px 18px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);">Латински</th>
                      <th style="text-align:left;padding:12px 18px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);">Български превод</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map((it, i) => {
                      // items are like "<strong>Ius/fas</strong> — Право / ..."
                      const m = it.match(/^\s*<strong>([\s\S]*?)<\/strong>\s*[—-]\s*([\s\S]*)$/);
                      const lat = m ? m[1] : it;
                      const bg = m ? m[2] : '';
                      return `
                        <tr style="border-top:0.5px solid var(--border);">
                          <td style="padding:12px 18px;color:var(--text-3);font-size:12px;">${i + 1}</td>
                          <td style="padding:12px 18px;font-weight:600;color:var(--navy);font-family:Georgia,serif;">${lat}</td>
                          <td style="padding:12px 18px;color:var(--text-1);line-height:1.6;">${bg}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              `}
            </div>
            <div style="margin-top:18px;display:flex;justify-content:space-between;gap:10px;">
              ${activeIdx > 0 ? `<a href="#/conspect/${id}?chapter=${activeIdx-1}" class="btn btn-outline btn-sm">← Предишен раздел</a>` : '<span></span>'}
              ${activeIdx < chapters.length - 1 ? `<a href="#/conspect/${id}?chapter=${activeIdx+1}" class="btn btn-gold btn-sm">Следващ раздел →</a>` : '<span></span>'}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // Live search
  const searchInput = $('#latSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const q = this.value.trim();
      const newHash = '#/conspect/' + id + '?chapter=' + activeIdx + (q ? '&q=' + encodeURIComponent(q) : '');
      history.replaceState(null, '', newHash);
      renderLatinDict(id, s);
      const inp = $('#latSearch');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    });
  }

  setTimeout(() => { updateTopicProgress(id, activeIdx, 'conspect', true); }, 3000);
}

function renderInlineQuiz(questions, subjId) {
  return '<div style="display:flex;flex-direction:column;gap:14px;">' +
    questions.map((q, qi) => {
      const qid = 'mq_' + Math.random().toString(36).slice(2, 8);
      return '<div style="background:var(--off-white);border-radius:var(--radius-m);padding:16px 18px;">' +
        '<div style="font-size:14px;font-weight:500;color:var(--navy);margin-bottom:12px;">' + (qi + 1) + '. ' + escapeHtml(q.q) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;" id="' + qid + '">' +
          q.options.map((opt, oi) => '<button class="quiz-option" data-correct="' + (oi === q.correct ? '1' : '0') + '" onclick="answerInlineQuiz(this, \u0027' + qid + '\u0027, ' + q.correct + ')" style="font-size:13px;padding:10px 14px;"><div class="quiz-letter" style="width:22px;height:22px;font-size:11px;">' + bukvaOpcia(oi) + '</div><div>' + escapeHtml(opt) + '</div></button>').join('') +
        '</div>' +
        '<div class="quiz-explain" id="' + qid + '_ex" style="display:none;font-size:12px;margin-top:10px;">' + escapeHtml(q.explain || '') + '</div>' +
      '</div>';
    }).join('') +
  '<div><a href="#/quiz/' + subjId + '" class="btn btn-outline btn-sm">Пълен тест по дисциплината →</a></div>' +
  '</div>';
}

window.toggleSection = function(headEl) {
  const sec = headEl.closest('.tp-section');
  if (sec) sec.classList.toggle('expanded');
};

/* === Video handlers === */
window.__videoMarkWatched = function (subjId, ti) {
  markVideoWatched(subjId, ti);
  toast('Маркирано като гледано', true);
  renderConspect(subjId);
};
window.__videoEnded = function (subjId, ti) { markVideoWatched(subjId, ti); };
window.__videoAdd = function (subjId, ti) {
  const url = prompt('URL на видеото (YouTube, Vimeo или директен MP4 линк):');
  if (!url) return;
  const duration = prompt('Продължителност (напр. "15 мин"), може да оставиш празно:') || '';
  setVideo(subjId, ti, { url: url.trim(), duration: duration.trim(), watched: false });
  toast('Видеото е добавено', true);
  renderConspect(subjId);
};

/* === Learning path handlers === */
window.__pathToggle = function (subjId, ti, key, done) {
  updateTopicProgress(subjId, ti, key, done);
  renderConspect(subjId);
};

/* === Notes handlers === */
window.__noteColor = function (btn) {
  const colors = btn.parentElement.querySelectorAll('.tp-color');
  colors.forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
};
window.__noteAdd = function (subjId, ti) {
  const ta = document.getElementById('noteText');
  const text = ta ? ta.value.trim() : '';
  if (!text) { toast('Напиши нещо в бележката'); return; }
  const activeColor = document.querySelector('.tp-notes-colors .tp-color.active');
  const color = activeColor ? activeColor.getAttribute('data-color') : 'yellow';
  addNote(subjId, ti, { note: text, color });
  toast('Бележката е запазена', true);
  renderConspect(subjId);
};
window.__noteDelInline = function (subjId, ti, noteId) {
  if (!confirm('Изтриване на бележката?')) return;
  deleteNote(subjId, ti, noteId);
  renderConspect(subjId);
};

window.toggleTopicDone = function(subjId, topicIdx) {
  const wasDone = isTopicDone(subjId, topicIdx);
  if (wasDone) {
    markTopicUndone(subjId, topicIdx);
    toast('Темата е отбелязана като незавършена');
  } else {
    markTopicDone(subjId, topicIdx);
    toast('Браво! Темата е завършена ✓', true);
  }
  router();
};

window.answerInlineQuiz = function(btn, qid, correctIdx) {
  const container = document.getElementById(qid);
  if (!container) return;
  const buttons = Array.from(container.querySelectorAll('.quiz-option'));
  buttons.forEach((b, i) => {
    b.style.pointerEvents = 'none';
    if (i === correctIdx) b.classList.add('correct');
    else if (b === btn) b.classList.add('wrong');
  });
  const ex = document.getElementById(qid + '_ex');
  if (ex) ex.style.display = 'block';
};

export { renderConspect, renderInlineQuiz, renderLatinDict };
