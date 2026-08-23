/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getFlashcards } from './01-seed.js';
import { getConspect } from './04-glossary.js';
import { mistakesCount } from './08-tetradka-na-greshkite.js';
import { saveState } from './09-backend-integraciya.js';
import { $, escapeHtml, isLoggedIn, ownsSubject } from './10-helpers.js';
import { currentStreak, isActiveDay, recordActivity, topicsDoneCount } from './11-topic-progress-streak-theme.js';
import { nextRecommendation } from './17-feature.js';
import { computeAchievements } from './19-feature.js';
import { formatDate, getEvents, getNextEventGlobal } from './20-exam-colloquium-config.js';
import { iconSvg } from './27-page.js';
import { aiBubbleHTML, emptyDashboard, quickTool, setupAIBubble, subjectCard } from './33-ai-asistent-v2.js';

/* =============================================================================
   PAGES — Dashboard
   ============================================================================= */
function renderDashboard() {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  recordActivity();
  saveState();

  const purchased = SUBJECTS.filter(s => ownsSubject(s.id));
  const nextEv = getNextEventGlobal();
  const allEvents = [];
  purchased.forEach(s => {
    getEvents(s.id).forEach(ev => allEvents.push({ ...ev, subjId: s.id, subjName: s.name }));
  });
  allEvents.sort((a, b) => a.days - b.days);

  // Aggregated stats
  let totalTopicsTotal = 0, totalTopicsDone = 0, totalCards = 0, totalMastered = 0;
  purchased.forEach(s => {
    const chapters = getConspect(s.id) || [];
    totalTopicsTotal += chapters.length;
    totalTopicsDone += topicsDoneCount(s.id);
    const cards = getFlashcards(s.id) || [];
    totalCards += cards.length;
    totalMastered += (state.fcMastered && state.fcMastered[s.id]) || 0;
  });
  const overallPct = totalTopicsTotal > 0 ? Math.round((totalTopicsDone / totalTopicsTotal) * 100) : 0;
  const streak = currentStreak();

  // Last studied — find most recently visited topic across subjects
  let lastStudied = null;
  purchased.forEach(s => {
    if (typeof state.lastTopic[s.id] === 'number') {
      const ch = getConspect(s.id);
      if (ch && ch[state.lastTopic[s.id]]) {
        const ts = (state.topicCompleted[s.id] && state.topicCompleted[s.id][state.lastTopic[s.id]]) || 0;
        if (!lastStudied || ts > lastStudied.ts) {
          lastStudied = { subjId: s.id, subjName: s.name, topicIdx: state.lastTopic[s.id], topicTitle: ch[state.lastTopic[s.id]].heading, ts };
        }
      }
    }
  });
  if (!lastStudied && purchased.length > 0) {
    const s = purchased[0];
    const ch = getConspect(s.id);
    lastStudied = { subjId: s.id, subjName: s.name, topicIdx: 0, topicTitle: ch[0]?.heading || '', ts: 0 };
  }

  // Streak visualization — last 7 days
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push({ ymd: d.toISOString().slice(0, 10), label: ['Н','П','В','С','Ч','П','С'][d.getDay()], full: ['Неделя','Понеделник','Вторник','Сряда','Четвъртък','Петък','Събота'][d.getDay()], today: i === 0 });
  }

  // Achievements
  const earned = computeAchievements();
  const allBadges = [
    { id: 'first_topic', name: 'Първа стъпка', desc: '1 завършена тема', icon: '✦' },
    { id: 'ten_topics', name: 'Десетка', desc: '10 теми', icon: '✦' },
    { id: 'fifty_topics', name: 'Половин път', desc: '50 теми', icon: '✦' },
    { id: 'streak_3', name: 'Постоянство', desc: '3 дни поредица', icon: '✧' },
    { id: 'streak_7', name: 'Седмица', desc: '7 дни поредица', icon: '✧' },
    { id: 'streak_30', name: 'Месец огън', desc: '30 дни', icon: '✧' },
    { id: 'cards_50', name: '50 карти', desc: 'Усвоени', icon: '◆' },
    { id: 'cards_200', name: '200 карти', desc: 'Експерт', icon: '◆' },
    { id: 'three_subjects', name: 'Тройна тяга', desc: '3+ дисциплини', icon: '◇' },
  ];

  $('#app').innerHTML = `
    <div class="dash">
      <aside class="dash-side">
        <a href="#/" class="logo" style="display:flex;align-items:center;"><img src="data:image/png;base64,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" alt="Law+" style="height:34px;width:auto;vertical-align:middle;margin-right:9px;">Law<span>+</span></a>
        <div class="dash-nav">
          <a href="#/dashboard" class="active">${iconSvg('check')}<span>Табло</span></a>
          <div class="dash-nav-section">Учене</div>
          ${purchased.length > 0 ? purchased.map(s => `
            <a href="#/subject/${s.id}">${iconSvg('book')}<span style="font-size:12px;">${escapeHtml(s.name.length > 18 ? s.name.slice(0, 17) + '…' : s.name)}</span></a>
          `).join('') : `<a href="#/packages">${iconSvg('book')}<span>Купи първи пакет</span></a>`}
          <div class="dash-nav-section">Инструменти</div>
          <a href="#/plan">${iconSvg('calendar')}<span>План</span></a>
          <a href="#/mistakes">${iconSvg('document')}<span>Грешки${mistakesCount() ? ' (' + mistakesCount() + ')' : ''}</span></a>
          <a href="#/packages">${iconSvg('document')}<span>Пакети</span></a>
        </div>
        <div class="dash-side-foot">
          ${escapeHtml(state.user.name)}<br>
          <a href="#/" onclick="logout()" style="color:var(--gold);">Изход</a>
        </div>
      </aside>
      <main class="dash-main">

        <!-- Premium hero with greeting + stats -->
        <div class="dash-hero">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;position:relative;z-index:1;">
            <div>
              <h2>Здравей, ${escapeHtml(state.user.name)}.</h2>
              <p class="greet-sub">${getDateString()} · ${streak > 0 ? streak + (streak === 1 ? ' ден' : ' дни') + ' поредица 🔥' : 'Започни своята поредица днес'}</p>
            </div>
            ${nextEv ? `
              <div style="background:rgba(201,163,93,0.15);border:0.5px solid rgba(201,163,93,0.3);padding:12px 18px;border-radius:var(--radius-m);text-align:right;">
                <div style="font-size:10px;color:var(--gold);letter-spacing:0.08em;">ДО ${nextEv.type === 'exam' ? 'ИЗПИТА' : 'КОЛОКВИУМА'}</div>
                <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:500;color:#fff;">${nextEv.days} ${nextEv.days === 1 ? 'ден' : 'дни'}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.7);">${escapeHtml(nextEv.subject)}</div>
              </div>
            ` : ''}
          </div>

          <div class="dash-hero-stats">
            <div class="dash-hero-stat">
              <div class="label">Общ прогрес</div>
              <div class="val">${overallPct}%</div>
              <div class="meta">${totalTopicsDone} от ${totalTopicsTotal} теми</div>
            </div>
            <div class="dash-hero-stat">
              <div class="label">Поредица</div>
              <div class="val">${streak}</div>
              <div class="meta">${streak === 0 ? 'дни — започни сега' : streak === 1 ? 'ден' : 'дни'}</div>
            </div>
            <div class="dash-hero-stat">
              <div class="label">Усвоени карти</div>
              <div class="val">${totalMastered}</div>
              <div class="meta">от ${totalCards} налични</div>
            </div>
            <div class="dash-hero-stat">
              <div class="label">Дисциплини</div>
              <div class="val">${purchased.length}</div>
              <div class="meta">активни</div>
            </div>
          </div>
        </div>

        ${purchased.length === 0 ? emptyDashboard() : `
          <!-- Next up recommendation (structured learning path) -->
          ${(function () {
            const recs = purchased.map(s => ({ subj: s, rec: nextRecommendation(s.id) })).filter(x => x.rec).slice(0, 2);
            if (recs.length === 0) return '';
            const actLabel = { conspect: 'Прочети конспекта', video: 'Гледай видеото', flashcards: 'Учи флашкарти', quiz: 'Реши тест', cases: 'Прегледай казуси' };
            const actIcon = { conspect: '📖', video: '▶', flashcards: '🃏', quiz: '✓', cases: '⚖' };
            return `
              <div class="dash-next">
                <div class="dash-section-title" style="margin-top:0;">Следващата ти стъпка</div>
                <div class="dash-next-grid">
                  ${recs.map(({ subj, rec }) => `
                    <a href="#/conspect/${subj.id}?chapter=${rec.topicIdx}" class="dash-next-card">
                      <div class="dash-next-sub">${escapeHtml(subj.name)}</div>
                      <div class="dash-next-title">${rec.topicIdx + 1}. ${escapeHtml(rec.title)}</div>
                      <div class="dash-next-action"><span>${actIcon[rec.nextActivity]}</span> ${actLabel[rec.nextActivity]}</div>
                      <div class="dash-next-progress">
                        <div class="dash-next-bar"><div class="dash-next-bar-fill" style="width:${Math.round((rec.done / rec.total) * 100)}%;"></div></div>
                        <span>${rec.done} / ${rec.total} задачи</span>
                      </div>
                    </a>
                  `).join('')}
                </div>
              </div>
            `;
          })()}

          <!-- Continue learning -->
          ${lastStudied ? `
            <div class="continue-card">
              <div>
                <div class="cc-eyebrow">Продължи откъдето спря</div>
                <div class="cc-title">${lastStudied.topicTitle}</div>
                <div class="cc-sub">${lastStudied.subjName}</div>
                <div class="cc-meta">
                  <span>Тема ${lastStudied.topicIdx + 1}</span>
                  <span>· ${lastStudied.ts ? 'Последно отворена ' + new Date(lastStudied.ts).toLocaleDateString('bg-BG') : 'не е отваряна'}</span>
                </div>
              </div>
              <a href="#/conspect/${lastStudied.subjId}?chapter=${lastStudied.topicIdx}" class="btn btn-gold btn-lg">Продължи →</a>
            </div>
          ` : ''}

          <!-- Отбелязани теми -->
          ${(state.bookmarks && state.bookmarks.length) ? `
            <div class="dash-section-title">★ Отбелязани теми</div>
            <div class="bm-row">
              ${state.bookmarks.slice(-6).reverse().map(b => {
                const chs = (window.PA_DATA.chapters || {})[b.sid] || [];
                const title = chs[b.ti] || ('Тема ' + (b.ti + 1));
                const sn = (SUBJECTS.find(x => x.id === b.sid) || {}).name || b.sid;
                return `<a class="bm-chip" href="#/conspect/${b.sid}?chapter=${b.ti}"><span class="bm-star">★</span><span class="bm-t">${escapeHtml(String(title).slice(0, 52))}</span><span class="bm-s">${escapeHtml(sn)}</span></a>`;
              }).join('')}
            </div>
          ` : ''}

          <!-- Streak strip -->
          <div class="p-card" style="padding:18px 22px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;">
            <div>
              <div style="font-size:12px;color:var(--text-3);letter-spacing:0.06em;text-transform:uppercase;">Активност · последните 7 дни</div>
              <div class="streak-row">
                ${last7.map(d => `<div class="streak-day ${isActiveDay(d.ymd) ? 'active' : ''} ${d.today ? 'today' : ''}" title="${d.full} · ${d.ymd.split('-').reverse().join('.')}${isActiveDay(d.ymd) ? ' — учил/а си' : ''}">${d.label}</div>`).join('')}
              </div>
            </div>
            <div style="text-align:right;">
              <div class="serif" style="font-size:24px;color:var(--navy);font-weight:500;">${streak} ${streak === 1 ? 'ден' : 'дни'}</div>
              <div style="font-size:11px;color:var(--text-3);">текуща поредица</div>
            </div>
          </div>

          ${allEvents.length > 0 ? `
            <div class="dash-section-title">Предстоящи изпити и колоквиуми</div>
            <div class="events-row" style="grid-template-columns: repeat(${Math.min(3, allEvents.length)}, 1fr);">
              ${allEvents.slice(0, 3).map(ev => `
                <div class="event-card upcoming" onclick="location.hash='#/exam-setup/${ev.subjId}'" style="cursor:pointer;">
                  <div class="ec-lbl">${ev.type === 'exam' ? 'ИЗПИТ' : escapeHtml(ev.name.toUpperCase())}</div>
                  <div class="ec-num" style="color:var(--navy);">${ev.days} ${ev.days === 1 ? 'ден' : 'дни'}</div>
                  <div class="ec-sub">${escapeHtml(ev.subjName || '')}</div>
                  <span class="ec-type ${ev.examType || 'written'}">${ev.examType === 'oral' ? 'устен' : 'писмен'} · ${formatDate(ev.date)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="dash-section-title">Моите дисциплини</div>
          <div class="subjects-grid">
            ${purchased.map(s => subjectCard(s)).join('')}
          </div>

          <div class="dash-section-title">Бърз достъп</div>
          <div class="tools-grid">
            ${quickTool('Конспект', 'Чети по теми', 'document', '#/conspect/' + purchased[0].id)}
            ${quickTool('Флашкарти', 'Тренирай', 'cards', '#/flashcards/' + purchased[0].id)}
            ${quickTool('Казуси', 'С решения', 'cases', '#/cases/' + purchased[0].id)}
            ${quickTool('Тестове', 'По теми', 'check', '#/quiz/' + purchased[0].id)}
            ${quickTool('План', 'Изготви', 'calendar', '#/plan')}
          </div>

          <div class="dash-section-title">Постижения</div>
          <div class="badge-grid">
            ${allBadges.map(b => `
              <div class="badge ${earned.includes(b.id) ? 'earned' : 'locked'}">
                <div class="badge-icon serif" style="font-size:24px;line-height:1;">${b.icon}</div>
                <div class="badge-name">${b.name}</div>
                <div class="badge-desc">${b.desc}</div>
              </div>
            `).join('')}
          </div>
        `}
      </main>
    </div>

    ${aiBubbleHTML()}
  `;

  setupAIBubble();
}

function getDateString() {
  const days = ['Неделя', 'Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота'];
  const months = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
  const d = new Date();
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export { getDateString, renderDashboard };
