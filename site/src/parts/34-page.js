/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getFlashcards } from './01-seed.js';
import { getConspect } from './04-glossary.js';
import { getCases } from './05-case-studies.js';
import { subjMistakes } from './08-tetradka-na-greshkite.js';
import { $, escapeHtml, isLoggedIn, ownsSubject, progressOf } from './10-helpers.js';
import { isTopicDone, topicsDoneCount } from './11-topic-progress-streak-theme.js';
import { srsTodayCount } from './12-srs.js';
import { formatDate, getEvents } from './20-exam-colloquium-config.js';
import { iconSvg } from './27-page.js';
import { aiBubbleHTML, setupAIBubble } from './33-ai-asistent-v2.js';
import { FREE_CARDS_LIMIT } from './35-page.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Subject detail
   ============================================================================= */
function renderSubject(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) {
    $('#app').innerHTML = `
      <section class="page-head">
        <div class="container">
          <h1>Този пакет не е закупен</h1>
          <p>За да достъпиш пълното съдържание на "${escapeHtml(s.name)}", е необходимо да закупиш пакета.
          Но първо можеш да го пробваш безплатно:</p>
          <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
            <a href="#/flashcards/${s.id}" class="btn btn-outline btn-lg">🎁 Пробвай ${FREE_CARDS_LIMIT} карти безплатно</a>
            <button class="btn btn-gold btn-lg" onclick="purchaseSubject('${s.id}')">Купи за 35 €</button>
            <a href="#/packages" class="btn btn-outline btn-lg">Назад към пакетите</a>
          </div>
        </div>
      </section>
    `;
    return;
  }

  const pct = progressOf(id) || 0; // истинският прогрес, не демо 35%
  const mCount = subjMistakes(id).length; // за плочката „Тетрадка на грешките"
  const events = getEvents(id);
  const nextEv = events[0];
  const conspectChapters = getConspect(id);
  const caseStudies = getCases(id);

  $('#app').innerHTML = `
    <section class="subj-page-head">
      <div class="container">
        <a href="#/dashboard" style="font-size:12px;color:rgba(255,255,255,0.6);text-decoration:none;">← Табло</a>
        <h1 style="margin-top:8px;">${escapeHtml(s.name)}</h1>
        <div class="meta">
          <span class="meta-item">${s.topics} теми</span>
          <span class="meta-item">${s.cards} флашкарти</span>
          ${nextEv ? `<span class="meta-item" style="color:var(--gold);">${nextEv.type === 'exam' ? 'Изпит' : nextEv.name} след ${nextEv.days} ${nextEv.days === 1 ? 'ден' : 'дни'}</span>` : ''}
        </div>
        <div class="subj-progress-bar">
          <div class="subj-progress-bar-row">
            <span>Прогрес</span>
            <span><strong style="color:var(--gold);">${pct}%</strong></span>
          </div>
          <div class="subj-progress-bar-track"><div class="subj-progress-bar-fill" style="width:0%" id="subjPB"></div></div>
        </div>
      </div>
    </section>

    <section style="padding-bottom:48px;">
      <div class="container">
        <div class="subj-tools-grid">
          <div class="subj-tool" onclick="location.hash='#/conspect/${id}'">
            <div class="subj-tool-icon">${iconSvg('document')}</div>
            <h4>${id === 'lat' ? 'Речник' : 'Конспект'}</h4>
            <p>${id === 'lat' ? conspectChapters.length + ' раздела с латинско-български речник.' : conspectChapters.length + ' разработени теми с препратки към законови текстове.'}</p>
          </div>
          ${id !== 'lat' ? `<div class="subj-tool" onclick="location.hash='#/cases/${id}'">
            <div class="subj-tool-icon">${iconSvg('cases')}</div>
            <h4>Казуси</h4>
            <p>${caseStudies.length} казуса с факти, въпроси и пълно решение по теми.</p>
          </div>` : ''}
          <div class="subj-tool" onclick="location.hash='#/flashcards/${id}'">
            <div class="subj-tool-icon">${iconSvg('cards')}</div>
            <h4>Флашкарти</h4>
            <p>${getFlashcards(id).length} карти, организирани по теми за първи прочит.</p>
          </div>
          <div class="subj-tool subj-tool-srs" onclick="location.hash='#/review/${id}'">
            <div class="subj-tool-icon">${iconSvg('brain')}</div>
            <h4>Повторение за днес ${srsTodayCount(id) > 0 ? `<span class="srs-badge">${srsTodayCount(id)}</span>` : ''}</h4>
            <p>${srsTodayCount(id) > 0 ? `${srsTodayCount(id)} карти за повторение по SRS алгоритъм.` : 'Няма карти за днес — върни се утре или изучи нови.'}</p>
          </div>
          <div class="subj-tool" onclick="location.hash='#/quiz/${id}'">
            <div class="subj-tool-icon">${iconSvg('check')}</div>
            <h4>Тестове</h4>
            <p>Реши тест по конкретни теми или върху всичко.</p>
          </div>
          <div class="subj-tool ${mCount ? 'subj-tool-srs' : ''}" onclick="location.hash='${mCount ? '#/mistakes-review/' + id : '#/mistakes'}'">
            <div class="subj-tool-icon">${iconSvg('document')}</div>
            <h4>Тетрадка на грешките ${mCount ? `<span class="srs-badge">${mCount}</span>` : ''}</h4>
            <p>${mCount ? mCount + ' сбъркани въпроса чакат преговор — изчисти ги.' : 'Чиста е! Сбърканите въпроси от тестовете идват тук.'}</p>
          </div>
          <div class="subj-tool" onclick="location.hash='#/exam-setup/${id}'">
            <div class="subj-tool-icon">${iconSvg('clock')}</div>
            <h4>Изпит и колоквиуми</h4>
            <p>${nextEv ? formatDate(nextEv.date) + ' · ' + (nextEv.examType === 'oral' ? 'устен' : 'писмен') : 'Задай дата, тип, обхват.'}</p>
          </div>
          ${id !== 'lat' ? `<div class="subj-tool" onclick="location.hash='#/exam-draw/${id}'">
            <div class="subj-tool-icon">${iconSvg('ticket')}</div>
            <h4>Тегли билет</h4>
            <p>Симулация на устен изпит — случайни теми, таймер, лична подготовка.</p>
          </div>` : ''}
          <div class="subj-tool" onclick="location.hash='#/plan?subject=${id}'">
            <div class="subj-tool-icon">${iconSvg('calendar')}</div>
            <h4>Учебен план</h4>
            <p>Изготви план до изпита според обхвата от теми.</p>
          </div>
        </div>

        <div class="topics-modern">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
            <h3 style="margin:0;">Програма на курса</h3>
            <span style="font-size:12px;color:var(--text-3);">${topicsDoneCount(id)} от ${s.chapters.length} завършени</span>
          </div>
          ${s.chapters.map((ch, i) => {
            const isDone = isTopicDone(id, i);
            const isLast = (typeof state.lastTopic[id] === 'number') && state.lastTopic[id] === i;
            const status = isDone ? 'done' : (isLast ? 'progress' : 'new');
            const statusLabel = isDone ? '✓ Завършена' : (isLast ? 'В процес' : 'Предстои');
            return `
              <div class="topic-modern-row" onclick="location.hash='#/conspect/${id}?chapter=${i}'">
                <div class="topic-modern-num">${String(i + 1).padStart(2, '0')}</div>
                <div class="topic-modern-title">${escapeHtml(ch)}</div>
                <div class="topic-modern-progress"><div class="topic-modern-progress-fill" style="width:${isDone ? '100%' : (isLast ? '50%' : '0%')};"></div></div>
                <div class="topic-modern-status ${status}">${statusLabel}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </section>

    ${aiBubbleHTML()}
  `;

  setTimeout(() => { const b = $('#subjPB'); if (b) b.style.width = pct + '%'; }, 100);
  setupAIBubble();
}

export { renderSubject };
