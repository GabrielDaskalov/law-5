/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { STATE_KEY } from './06-state.js';
import { apiFetch, backendReady, saveState } from './09-backend-integraciya.js';
import { $, bukvaOpcia, el, escapeHtml, isLoggedIn, toast } from './10-helpers.js';
import { currentStreak, isActiveDay, todayStr } from './11-topic-progress-streak-theme.js';
import { cardId, srsHumanIvl, srsStats, srsTodayCount } from './12-srs.js';
import { Activity, ContentStore, Users, isAdmin } from './14-data-service.js';
import { fmtBytes, localStorageSize } from './15-api.js';
import { LocalAuth } from './24-lokalni-akaunti.js';

/* =============================================================================
   PAGES — Admin panel
   ============================================================================= */
function renderAdmin(params) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  if (!isAdmin()) {
    $('#app').innerHTML = `
      <section class="page-head"><div class="container" style="text-align:center;padding:80px 0;">
        <div class="serif" style="font-size:64px;color:var(--gold);">⊘</div>
        <h1>Достъп само за администратори</h1>
        <p style="margin:12px auto 24px;">Този раздел е достъпен само за account-а на собственика на платформата.</p>
        <a href="#/dashboard" class="btn btn-gold">Към табло</a>
      </div></section>`;
    return;
  }
  const tab = (params && params.get('tab')) || state.adminTab || 'overview';
  state.adminTab = tab;
  const TABS = [
    { id: 'overview', label: 'Преглед', ic: '▦' },
    { id: 'me',       label: 'Моят прогрес', ic: '◔' },
    { id: 'users',    label: 'Потребители', ic: '◊' },
    { id: 'sales',    label: 'Продажби', ic: '¤' },
    { id: 'support',  label: 'Поддръжка', ic: '✉' },
    { id: 'content',  label: 'Съдържание', ic: '✎' },
    { id: 'system',   label: 'Система', ic: '⚙' },
  ];
  const nav = TABS.map(t => `
    <a href="#/admin?tab=${t.id}" class="${tab === t.id ? 'active' : ''}">
      <span class="ic">${t.ic}</span>${t.label}
    </a>`).join('');

  $('#app').innerHTML = `
    <div class="adm-page">
      <aside class="adm-side">
        <div class="adm-side-brand">
          <div class="lg">Law+</div>
          <div class="sub">Admin · Console</div>
        </div>
        <div class="adm-side-nav">${nav}</div>
        <div class="adm-side-foot">
          v2.0 · съдържание от базата<br>
          <a href="#/dashboard">← Към публичния сайт</a>
        </div>
      </aside>
      <main class="adm-main" id="admMain"></main>
    </div>`;

  if (tab === 'overview') renderAdminOverview();
  else if (tab === 'me') renderAdminProgress();
  else if (tab === 'users') renderAdminUsers();
  else if (tab === 'sales') renderAdminSales();
  else if (tab === 'support') renderAdminSupport();
  else if (tab === 'content') renderAdminContent(params);
  else if (tab === 'system') renderAdminSystem();
}

/* ---------- ОБЩА HELPER FUNCTIONS ---------- */
function adminContentCounts() {
  let fc = 0, qz = 0, cs = 0, ch = 0;
  SUBJECTS.forEach(s => {
    fc += ContentStore.flashcards(s.id).length;
    qz += ContentStore.quiz(s.id).length;
    cs += ContentStore.cases(s.id).length;
    ch += (s.chapters || []).length;
  });
  return { fc, qz, cs, ch };
}

function adminSrsTotals() {
  let total = 0, learned = 0, mature = 0, young = 0, lapsed = 0;
  SUBJECTS.forEach(s => {
    const stats = srsStats(s.id);
    total += stats.total;
    learned += stats.learned;
    mature += stats.mature;
    young += stats.young;
    lapsed += stats.lapsed;
  });
  return { total, learned, mature, young, lapsed, fresh: total - learned };
}

/* ---------- TAB: Overview ---------- */
/* ---------- ПРОДАЖБИ ---------- */
function renderAdminSales() {
  const PRICE = id => id === 'bundle' ? 165 : 35;
  const purchases = (state.purchased || []).filter(Boolean);
  const evts = (state.events || []).filter(e => e.type === 'checkout.success');
  const dateFor = id => {
    const e = evts.find(x => x.meta && x.meta.packageId === id);
    return e && e.ts ? new Date(e.ts).toLocaleDateString('bg-BG') : '—';
  };
  const nameFor = id => id === 'bundle' ? 'Комплексен пакет (всички)' : (SUBJECTS.find(x => x.id === id) || {}).name || id;
  const revenue = purchases.reduce((a, id) => a + PRICE(id), 0);
  const avg = purchases.length ? Math.round(revenue / purchases.length) : 0;

  const rows = purchases.length ? purchases.map(id => `
    <tr><td>${escapeHtml(nameFor(id))}</td><td>${PRICE(id)} €</td><td>${dateFor(id)}</td></tr>
  `).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-3);padding:24px;">Още няма покупки в този браузър</td></tr>';

  $('#admMain').innerHTML = `
    <div class="adm-head"><div><h1>Продажби</h1><div class="sub">Демо данни от този браузър · при пуснат сървър тук са реалните продажби</div></div></div>
    <div class="adm-cards">
      <div class="adm-card"><div class="lbl">Приходи (демо)</div><div class="val">${revenue} €</div><div class="meta">≈ ${(revenue * 1.95583).toFixed(0)} лв</div></div>
      <div class="adm-card"><div class="lbl">Покупки</div><div class="val">${purchases.length}</div><div class="meta">пакета</div></div>
      <div class="adm-card"><div class="lbl">Среден чек</div><div class="val">${avg} €</div><div class="meta">на покупка</div></div>
      <div class="adm-card"><div class="lbl">Комплексен пакет</div><div class="val">${purchases.includes('bundle') ? 'Да' : 'Не'}</div><div class="meta">притежаван</div></div>
    </div>
    <div class="adm-section">
      <h3>Покупки</h3>
      <table class="adm-table"><thead><tr><th>Пакет</th><th>Цена</th><th>Дата</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="adm-section" id="admSalesLive" style="display:none;"></div>`;

  // при жив сървър — реалната статистика
  (async () => {
    try {
      if (!(await backendReady())) return;
      const r = await apiFetch('/api/admin/sales');
      const d = r.data || {};
      const el = document.getElementById('admSalesLive');
      if (!el) return;
      el.style.display = 'block';
      el.innerHTML = '<h3>🌐 Реални продажби (от сървъра)</h3>' +
        '<div class="adm-cards">' +
        '<div class="adm-card"><div class="lbl">Общо приходи</div><div class="val">' + (d.total_revenue_eur || 0).toFixed(2) + ' €</div></div>' +
        '<div class="adm-card"><div class="lbl">Покупки</div><div class="val">' + (d.total_purchases || 0) + '</div></div>' +
        '<div class="adm-card"><div class="lbl">Последните 30 дни</div><div class="val">' + (d.revenue_30d_eur || 0).toFixed(2) + ' €</div></div>' +
        '</div>' +
        (Array.isArray(d.by_package) && d.by_package.length ?
          '<table class="adm-table"><thead><tr><th>Пакет</th><th>Брой</th><th>Приход</th></tr></thead><tbody>' +
          d.by_package.map(x => '<tr><td>' + escapeHtml(x.package_id) + '</td><td>' + x.cnt + '</td><td>' + (x.eur || 0).toFixed(2) + ' €</td></tr>').join('') +
          '</tbody></table>' : '');
    } catch (e) { /* без сървър — само демо изгледът */ }
  })();
}

/* ---------- ПОДДРЪЖКА (тикети) ---------- */
function renderAdminSupport() {
  const tickets = (state.supportTickets || []).slice();
  const chip = st => '<span class="ticket-status status-' + (st || 'open') + '">' + (st === 'replied' ? 'отговорен' : st === 'closed' ? 'затворен' : 'отворен') + '</span>';
  const rows = tickets.length ? tickets.map(t => `
    <tr>
      <td><strong>${escapeHtml(String(t.subject || '').slice(0, 60))}</strong><br>
        <span style="font-size:12px;color:var(--text-3);">${escapeHtml(String(t.body || '').slice(0, 100))}</span></td>
      <td>${t.createdAt ? new Date(t.createdAt).toLocaleDateString('bg-BG') : '—'}</td>
      <td>${chip(t.status)}</td>
      <td style="white-space:nowrap;">
        ${t.status !== 'replied' ? '<button class="adm-btn-sm" onclick="window.__admTicSet(\'' + t.id + '\', \'replied\')">✓ Отговорен</button>' : ''}
        ${t.status !== 'closed' ? '<button class="adm-btn-sm" onclick="window.__admTicSet(\'' + t.id + '\', \'closed\')">Затвори</button>' : ''}
      </td>
    </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:24px;">Няма тикети — когато потребител пише през „Поддръжка“, се появяват тук</td></tr>';

  $('#admMain').innerHTML = `
    <div class="adm-head"><div><h1>Поддръжка</h1><div class="sub">${tickets.length} тикета · локални · при жив сървър се показват всички потребителски</div></div></div>
    <div class="adm-section">
      <table class="adm-table"><thead><tr><th>Тикет</th><th>Дата</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="adm-section" id="admTicLive" style="display:none;"></div>`;

  (async () => {
    try {
      if (!(await backendReady())) return;
      const r = await apiFetch('/api/admin/tickets');
      const list = (r.data && (r.data.tickets || r.data)) || [];
      const el = document.getElementById('admTicLive');
      if (!el || !Array.isArray(list)) return;
      el.style.display = 'block';
      el.innerHTML = '<h3>🌐 Тикети от сървъра (' + list.length + ')</h3>' +
        (list.length ? '<table class="adm-table"><thead><tr><th>Тема</th><th>Имейл</th><th>Статус</th></tr></thead><tbody>' +
        list.map(t => '<tr><td>' + escapeHtml(String(t.subject || '').slice(0, 60)) + '</td><td>' + escapeHtml(t.email || t.user_email || '—') + '</td><td>' + chip(t.status) + '</td></tr>').join('') +
        '</tbody></table>' : '<p style="color:var(--text-3);">Няма тикети на сървъра.</p>');
    } catch (e) { /* демо режим */ }
  })();
}

window.__admTicSet = function(id, status) {
  const t = (state.supportTickets || []).find(x => x.id === id);
  if (!t) return;
  t.status = status;
  saveState();
  renderAdminSupport();
  toast(status === 'closed' ? 'Тикетът е затворен' : 'Отбелязан като отговорен');
};

function renderAdminOverview() {
  const c = adminContentCounts();
  const sr = adminSrsTotals();
  const today = todayStr();
  const todayEvents = (state.events || []).filter(e => new Date(e.ts).toISOString().slice(0,10) === today);
  const recentReviews = todayEvents.filter(e => e.type === 'srs.grade').length;
  const recentExams = todayEvents.filter(e => e.type === 'exam-draw.finish').length;
  const purchased = (state.purchased || []).length;
  $('#admMain').innerHTML = `
    <div class="adm-head">
      <div><h1>Преглед</h1><div class="sub">Бърз поглед върху платформата</div></div>
      <span class="live">На живо</span>
    </div>

    <div class="adm-banner">
      <div>
        <h4>Готов за launch?</h4>
        <p>Съдържанието е в базата и се редактира оттук — промените се виждат от студентите веднага. Достъпът до платените материали се проверява на сървъра. Виж раздела „Система" за архив и износ.</p>
      </div>
      <a href="#/admin?tab=system" class="btn btn-gold cta">Към „Система" →</a>
    </div>

    <div class="adm-grid">
      <div class="adm-stat"><div class="k">Дисциплини</div><div class="v">${SUBJECTS.length}</div><div class="d">${purchased} закупени</div></div>
      <div class="adm-stat"><div class="k">Флашкарти</div><div class="v">${c.fc.toLocaleString('bg-BG')}</div><div class="d">${sr.learned} научени</div></div>
      <div class="adm-stat"><div class="k">Тестови въпроси</div><div class="v">${c.qz.toLocaleString('bg-BG')}</div><div class="d">${c.ch} теми</div></div>
      <div class="adm-stat"><div class="k">Казуси</div><div class="v">${c.cs.toLocaleString('bg-BG')}</div><div class="d">пълни решения</div></div>
    </div>

    <div class="adm-section">
      <h3>Активност днес <span class="count">${todayEvents.length} събития</span></h3>
      <div class="adm-grid">
        <div class="adm-stat"><div class="k">SRS повторения</div><div class="v">${recentReviews}</div><div class="d">${todayStr()}</div></div>
        <div class="adm-stat"><div class="k">Тегления на билет</div><div class="v">${recentExams}</div></div>
        <div class="adm-stat"><div class="k">Streak</div><div class="v">${currentStreak()}</div><div class="d">последователни дни</div></div>
        <div class="adm-stat"><div class="k">Карти за повторение</div><div class="v">${SUBJECTS.reduce((a,s)=>a+srsTodayCount(s.id),0)}</div><div class="d">общо за днес</div></div>
      </div>
    </div>

    <div class="adm-section">
      <h3>Покритие по дисциплини</h3>
      <table class="adm-table">
        <thead><tr><th>Дисциплина</th><th>Теми</th><th>Флашкарти</th><th>Тестове</th><th>Казуси</th><th>Прогрес</th></tr></thead>
        <tbody>
          ${SUBJECTS.map(s => {
            const fc = ContentStore.flashcards(s.id).length;
            const qz = ContentStore.quiz(s.id).length;
            const cs = ContentStore.cases(s.id).length;
            const st = srsStats(s.id);
            const pct = st.total ? Math.round((st.learned / st.total) * 100) : 0;
            return `<tr>
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${(s.chapters||[]).length}</td>
              <td>${fc}</td>
              <td>${qz}</td>
              <td>${cs}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:var(--gold);"></div>
                  </div>
                  <span style="font-size:11px;color:var(--text-3);min-width:30px;">${pct}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="adm-section">
      <h3>Последни 15 събития</h3>
      ${Activity.recent(15).length === 0
        ? '<p style="color:var(--text-3);font-size:13px;">Няма регистрирани събития. Те ще се появят, докато ползваш сайта (повторения, тегления на билет, редакции на съдържание).</p>'
        : Activity.recent(15).map(e => {
            const d = new Date(e.ts);
            const time = String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
            const date = d.getDate()+'.'+String(d.getMonth()+1).padStart(2,'0');
            const detail = e.payload ? Object.entries(e.payload).map(([k,v])=>`${k}=${v}`).join(', ') : '';
            return `<div class="adm-event-row">
              <span class="time">${date} ${time}</span>
              <span class="type">${e.type}</span>
              <span class="det">${e.subj ? '<strong>'+e.subj+'</strong> · ' : ''}${escapeHtml(detail)}</span>
            </div>`;
          }).join('')}
    </div>
  `;
}

/* ---------- TAB: My progress ---------- */
function renderAdminProgress() {
  const sr = adminSrsTotals();
  const learnedPct = sr.total ? Math.round((sr.learned / sr.total) * 100) : 0;
  // Build last 105 days heatmap (15 cols × 7 rows)
  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const byDate = Activity.byDate();
  for (let i = 104; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ymd = d.toISOString().slice(0,10);
    const count = byDate[ymd] || 0;
    const active = isActiveDay(ymd) ? 1 : 0;
    const level = count >= 30 ? 4 : count >= 15 ? 3 : count >= 5 ? 2 : count >= 1 ? 1 : (active ? 1 : 0);
    days.push({ ymd, level, count, label: d.getDate()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear() });
  }
  // Per-subject SRS
  const perSubj = SUBJECTS.map(s => ({ s, st: srsStats(s.id), due: srsTodayCount(s.id) })).filter(x => x.st.total > 0);
  // Weak topics (across all subjects) — by SRS lapses + low ease
  const weak = [];
  SUBJECTS.forEach(s => {
    const subSrs = state.srs[s.id] || {};
    const cards = ContentStore.flashcards(s.id);
    cards.forEach(c => {
      const st = subSrs[cardId(c)];
      if (st && (st.lapses >= 2 || st.ease < 2.0)) {
        weak.push({ subj: s, card: c, lapses: st.lapses, ease: st.ease, ivl: st.ivl });
      }
    });
  });
  weak.sort((a,b) => (b.lapses - a.lapses) || (a.ease - b.ease));
  // Exam draw history
  const allDraws = [];
  Object.keys(state.examDrawHistory || {}).forEach(sid => {
    (state.examDrawHistory[sid] || []).forEach(d => allDraws.push({ ...d, subjId: sid }));
  });
  allDraws.sort((a,b) => b.ts - a.ts);

  $('#admMain').innerHTML = `
    <div class="adm-head">
      <div><h1>Моят прогрес</h1><div class="sub">${state.user ? escapeHtml(state.user.email || state.user.name) : ''}</div></div>
    </div>

    <div class="adm-grid">
      <div class="adm-stat"><div class="k">Streak</div><div class="v">${currentStreak()}</div><div class="d">последователни дни</div></div>
      <div class="adm-stat"><div class="k">Научени карти</div><div class="v">${sr.learned}</div><div class="d">от ${sr.total} (${learnedPct}%)</div></div>
      <div class="adm-stat"><div class="k">Зрели карти</div><div class="v">${sr.mature}</div><div class="d">интервал ≥ 21 дни</div></div>
      <div class="adm-stat"><div class="k">За повторение днес</div><div class="v">${SUBJECTS.reduce((a,s)=>a+srsTodayCount(s.id),0)}</div></div>
    </div>

    <div class="adm-section">
      <h3>Активност · последни 105 дни</h3>
      <div class="adm-heat">
        ${days.map(d => `<div class="adm-heat-day" data-l="${d.level}" data-tip="${d.label} · ${d.count} събития"></div>`).join('')}
      </div>
      <div class="adm-heat-legend">
        По-малко
        <span class="swatch" style="background:#ededed;"></span>
        <span class="swatch" style="background:#d6eada;"></span>
        <span class="swatch" style="background:#92cfa1;"></span>
        <span class="swatch" style="background:#4ea567;"></span>
        <span class="swatch" style="background:#2c6e3f;"></span>
        Повече
      </div>
    </div>

    <div class="adm-section">
      <h3>SRS състояние по дисциплини</h3>
      ${perSubj.length === 0 ? '<p style="color:var(--text-3);font-size:13px;">Все още не си започнал SRS повторения. Започни от страницата на дисциплината → „Повторение за днес".</p>' :
      perSubj.map(({ s, st, due }) => {
        const newPct = (st.newCount/st.total*100);
        const youngPct = (st.young/st.total*100);
        const maturePct = (st.mature/st.total*100);
        return `
          <div style="margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
              <strong>${escapeHtml(s.name)}</strong>
              <span style="color:var(--text-3);font-size:12px;">${st.learned}/${st.total} научени · ${due} за днес</span>
            </div>
            <div class="adm-srs-bar">
              <div class="new" style="width:${newPct}%;"></div>
              <div class="young" style="width:${youngPct}%;"></div>
              <div class="mature" style="width:${maturePct}%;"></div>
            </div>
            <div class="adm-srs-legend">
              <span><span class="dot" style="background:#4a9eff;"></span>Нови: ${st.newCount}</span>
              <span><span class="dot" style="background:#f59e0b;"></span>В обучение: ${st.young}</span>
              <span><span class="dot" style="background:#15803d;"></span>Усвоени: ${st.mature}</span>
              <span><span class="dot" style="background:#b91c1c;"></span>С пропуски: ${st.lapsed}</span>
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="adm-section">
      <h3>Слаби места <span class="count">${weak.length}</span></h3>
      ${weak.length === 0
        ? '<p style="color:var(--text-3);font-size:13px;">Все още няма карти с многократни пропуски. Системата ще ги идентифицира по време на повторенията.</p>'
        : `<table class="adm-table"><thead><tr><th>Дисциплина</th><th>Въпрос</th><th>Пропуски</th><th>Улеснение</th><th>Интервал</th></tr></thead><tbody>
            ${weak.slice(0,15).map(w => `<tr>
              <td>${escapeHtml(w.subj.name).slice(0,18)}</td>
              <td style="max-width:380px;">${escapeHtml(String(w.card.q).replace(/<[^>]+>/g,'').slice(0,90))}…</td>
              <td><span style="color:#b91c1c;font-weight:600;">${w.lapses}</span></td>
              <td>${w.ease.toFixed(2)}</td>
              <td>${srsHumanIvl(w.ivl)}</td>
            </tr>`).join('')}
          </tbody></table>`}
    </div>

    <div class="adm-section">
      <h3>История на тегли билет <span class="count">${allDraws.length}</span></h3>
      ${allDraws.length === 0
        ? '<p style="color:var(--text-3);font-size:13px;">Все още не си тегли билет. Опитай от страница на дисциплината → „Тегли билет".</p>'
        : `<table class="adm-table"><thead><tr><th>Дата</th><th>Дисциплина</th><th>Теми</th><th>Време</th><th>Самооценка</th></tr></thead><tbody>
            ${allDraws.slice(0,15).map(d => {
              const dt = new Date(d.ts);
              const dateStr = dt.getDate()+'.'+String(dt.getMonth()+1).padStart(2,'0')+'.'+dt.getFullYear();
              const subj = SUBJECTS.find(s => s.id === d.subjId);
              const titles = (d.topics||[]).map(t => (subj && subj.chapters[t]) || ('Тема '+(t+1))).join(' · ');
              const avg = (d.ratings||[]).length ? (d.ratings.reduce((a,b)=>a+b,0)/d.ratings.length).toFixed(1) : '–';
              return `<tr>
                <td>${dateStr}</td>
                <td>${subj ? escapeHtml(subj.name) : d.subjId}</td>
                <td style="font-size:12px;max-width:280px;">${escapeHtml(titles).slice(0,80)}</td>
                <td>${d.minutes} мин</td>
                <td><strong style="color:var(--gold-3);">${avg !== '–' ? '★ '+avg : '–'}</strong></td>
              </tr>`;
            }).join('')}
          </tbody></table>`}
    </div>
  `;
}

/* ---------- TAB: Users ---------- */
function renderAdminUsers() {
  const users = Users.list();
  const fmtD = ts => ts ? new Date(ts).toLocaleDateString('bg-BG') : '—';
  const rows = users.length ? users.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.name)}</strong><br><span style="font-size:12px;color:var(--text-3);">${escapeHtml(u.email)}</span></td>
      <td>${fmtD(u.createdAt)}</td>
      <td>${fmtD(u.lastActive)}</td>
      <td>${(u.purchased || []).length}</td>
      <td>${u.topicsDone || 0}</td>
      <td>${u.mistakes || 0}</td>
      <td style="white-space:nowrap;">
        <button class="adm-btn-sm" data-adm-act="resetpass" data-adm-email="${escapeHtml(u.email)}">Нова парола</button>
        ${(state.user && state.user.email === u.email) ? '' : '<button class="adm-btn-sm danger" data-adm-act="deluser" data-adm-email="' + escapeHtml(u.email) + '">Изтрий</button>'}
      </td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px;">Няма регистрирани акаунти</td></tr>';

  $('#admMain').innerHTML = `
    <div class="adm-head">
      <div><h1>Потребители</h1><div class="sub">${users.length} ${users.length === 1 ? 'акаунт' : 'акаунта'} · регистрирани в този браузър</div></div>
    </div>
    <div class="adm-banner">
      <div>
        <h4>Локални акаунти (демо)</h4>
        <p>Това са акаунтите, регистрирани в ТОЗИ браузър — с истински пароли (хеширани), всеки със собствен прогрес. При пуснат сървър тук се показват всички реални потребители от базата данни.</p>
      </div>
    </div>
    <div class="adm-section">
      <h3>Акаунти <span class="count">${users.length}</span></h3>
      <table class="adm-table">
        <thead><tr><th>Потребител</th><th>Регистриран</th><th>Последно</th><th>Пакети</th><th>Завършени теми</th><th>Грешки</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="adm-section" id="admUsersLive" style="display:none;"></div>`;

  // Бутоните носят имейла в data-атрибут, а не в onclick. Така съдържанието
  // на полето „имейл" никога не се тълкува като код — дори при регистрация
  // с нарочно подправен адрес.
  const admMain = $('#admMain');
  if (admMain) {
    admMain.addEventListener('click', (e) => {
      const b = e.target.closest('[data-adm-act]');
      if (!b) return;
      const mail = b.getAttribute('data-adm-email') || '';
      if (b.getAttribute('data-adm-act') === 'resetpass') window.__admUserResetPass(mail);
      else if (b.getAttribute('data-adm-act') === 'deluser') window.__admUserDelete(mail);
    });
  }

  // при жив сървър — реалните потребители
  (async () => {
    try {
      if (!(await backendReady())) return;
      const r = await apiFetch('/api/admin/users?limit=50');
      const list = (r.data && (r.data.users || r.data)) || [];
      const el = document.getElementById('admUsersLive');
      if (!el || !Array.isArray(list)) return;
      el.style.display = 'block';
      el.innerHTML = '<h3>🌐 Потребители от сървъра (' + list.length + ')</h3>' +
        '<table class="adm-table"><thead><tr><th>Име</th><th>Имейл</th><th>Роля</th><th>Регистриран</th></tr></thead><tbody>' +
        list.map(u => '<tr><td>' + escapeHtml(u.name || '—') + '</td><td>' + escapeHtml(u.email || '') + '</td><td>' + escapeHtml(u.role || 'student') + '</td><td>' + (u.created_at ? new Date(u.created_at).toLocaleDateString('bg-BG') : '—') + '</td></tr>').join('') +
        '</tbody></table>';
    } catch (e) { /* демо режим */ }
  })();
}

window.__admUserResetPass = async function(email) {
  const temp = 'Law' + Math.random().toString(36).slice(2, 8) + '!';
  const ok = await LocalAuth.setPassword(email, temp);
  if (ok) {
    toast('Нова парола за ' + email + ': ' + temp, true);
    // показваме я и в панела, за да може да се копира
    const el = document.getElementById('admUsersLive');
    if (el) { el.style.display = 'block'; el.innerHTML = '<div class="adm-banner"><div><h4>Временна парола</h4><p><strong>' + escapeHtml(email) + '</strong> → <code style="user-select:all;">' + temp + '</code> — дай я на потребителя, той може да я смени от „Забравена парола“.</p></div></div>' + el.innerHTML.replace(/^<div class="adm-banner">.*?<\/div><\/div><\/div>/s, ''); }
  } else toast('⚠ Акаунтът не е намерен');
};

window.__admUserDelete = function(email) {
  if (state.user && state.user.email === email) { toast('Не можеш да изтриеш акаунта, с който си влязъл'); return; }
  LocalAuth.remove(email);
  toast('Акаунтът ' + email + ' е изтрит');
  renderAdminUsers();
};

const ADM_VIDOVE = ['flashcards', 'cases', 'quizzes'];

function renderAdminContent(params) {
  // kind и subj идват направо от адреса. Ако не ги сверим със списъка,
  // всичко, което посетителят напише в URL-а, влиза в onclick атрибут.
  const kindRaw = (params && params.get('kind')) || 'flashcards';
  const kind = ADM_VIDOVE.indexOf(kindRaw) !== -1 ? kindRaw : 'flashcards';
  const subjRaw = (params && params.get('subj')) || SUBJECTS[0].id;
  const subjId = SUBJECTS.some(s => s.id === subjRaw) ? subjRaw : SUBJECTS[0].id;
  const search = (params && params.get('q')) || '';
  const topicFilter = (params && params.get('topic')) || '';
  const subj = SUBJECTS.find(s => s.id === subjId);

  function tabBtn(k, label) {
    return `<button class="ed-chip ${kind === k ? 'active' : ''}" onclick="window.__admGo('${k}','${subjId}')">${label}</button>`;
  }

  let items = [];
  if (kind === 'flashcards') items = ContentStore.flashcards(subjId);
  else if (kind === 'cases') items = ContentStore.cases(subjId);
  else if (kind === 'quizzes') items = ContentStore.quiz(subjId);

  const overridden = ContentStore.hasOverride(kind, subjId);

  // filter
  let filtered = items.map((it, i) => ({ it, i }));
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(({ it }) => {
      const hay = (it.q || it.title || '') + ' ' + (it.a || it.facts || '') + ' ' + (it.solution || '');
      return String(hay).toLowerCase().indexOf(q) !== -1;
    });
  }
  if (topicFilter !== '') {
    const ti = parseInt(topicFilter, 10);
    filtered = filtered.filter(({ it }) => it.topicIdx === ti);
  }

  // table rendering depends on kind
  const renderRow = ({ it, i }) => {
    if (kind === 'flashcards') {
      return `<tr>
        <td style="width:40px;color:var(--text-3);">${i + 1}</td>
        <td style="max-width:380px;"><div style="font-weight:500;">${escapeHtml(String(it.q).replace(/<[^>]+>/g,'').slice(0,140))}</div></td>
        <td style="max-width:380px;color:var(--text-2);font-size:12px;">${escapeHtml(String(it.a).replace(/<[^>]+>/g,'').slice(0,160))}…</td>
        <td><span style="background:var(--bg-1);padding:2px 8px;border-radius:999px;font-size:11px;">${(it.topicIdx ?? 0) + 1}</span></td>
        <td class="tx-actions">
          <button class="adm-btn-sm" onclick="window.__admEdit('${kind}','${subjId}',${i})">Редакция</button>
          <button class="adm-btn-sm danger" onclick="window.__admDel('${kind}','${subjId}',${i})">Изтрий</button>
        </td>
      </tr>`;
    }
    if (kind === 'cases') {
      return `<tr>
        <td style="width:40px;color:var(--text-3);">${it.num || (i + 1)}</td>
        <td><div style="font-weight:500;">${escapeHtml(it.title || '')}</div></td>
        <td style="max-width:380px;color:var(--text-2);font-size:12px;">${escapeHtml(String(it.facts || '').slice(0,160))}…</td>
        <td><span style="background:var(--bg-1);padding:2px 8px;border-radius:999px;font-size:11px;">${(it.topicIdx ?? 0) + 1}</span></td>
        <td class="tx-actions">
          <button class="adm-btn-sm" onclick="window.__admEdit('${kind}','${subjId}',${i})">Редакция</button>
          <button class="adm-btn-sm danger" onclick="window.__admDel('${kind}','${subjId}',${i})">Изтрий</button>
        </td>
      </tr>`;
    }
    // quizzes
    return `<tr>
      <td style="width:40px;color:var(--text-3);">${i + 1}</td>
      <td style="max-width:480px;"><div>${escapeHtml(String(it.q).slice(0,160))}</div></td>
      <td style="color:var(--text-2);font-size:12px;">✓ ${escapeHtml(String((it.options||[])[it.correct] || '').slice(0,60))}</td>
      <td><span style="background:var(--bg-1);padding:2px 8px;border-radius:999px;font-size:11px;">${(it.topicIdx ?? 0) + 1}</span></td>
      <td class="tx-actions">
        <button class="adm-btn-sm" onclick="window.__admEdit('${kind}','${subjId}',${i})">Редакция</button>
        <button class="adm-btn-sm danger" onclick="window.__admDel('${kind}','${subjId}',${i})">Изтрий</button>
      </td>
    </tr>`;
  };

  $('#admMain').innerHTML = `
    <div class="adm-head">
      <div><h1>Управление на съдържание</h1><div class="sub">Промените се записват в базата и се виждат от студентите веднага.</div></div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" onclick="window.__admExport()">📥 Export data.js</button>
        ${overridden ? `<button class="btn btn-outline" onclick="window.__admRevert('${kind}','${subjId}')" style="color:#b91c1c;">↩ Revert</button>` : ''}
      </div>
    </div>

    <div class="adm-section">
      <div class="ed-chips" style="margin-bottom:14px;">
        ${tabBtn('flashcards', 'Флашкарти')}
        ${tabBtn('cases', 'Казуси')}
        ${tabBtn('quizzes', 'Тестове')}
      </div>

      <div class="adm-filters">
        <select onchange="window.__admSubj(this.value)">
          ${SUBJECTS.map(s => `<option value="${s.id}" ${s.id === subjId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <select onchange="window.__admTopic(this.value)">
          <option value="">Всички теми</option>
          ${(subj?.chapters || []).map((c, i) => `<option value="${i}" ${String(i) === topicFilter ? 'selected' : ''}>${i+1}. ${escapeHtml(c).slice(0,40)}</option>`).join('')}
        </select>
        <input type="search" class="grow" placeholder="Търси в текста…" value="${escapeHtml(search)}" oninput="window.__admSearch(this.value)">
        <span class="info">${filtered.length} от ${items.length}</span>
        <button class="adm-btn-sm primary" onclick="window.__admAdd('${kind}','${subjId}')">+ Нов</button>
      </div>

      ${overridden ? '<div style="background:#fef3c7;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;color:#a16207;">⚠ Тази дисциплина има локални промени, които не са в data.js — натисни „Export" за да ги запазиш.</div>' : ''}

      <div style="overflow-x:auto;">
        <table class="adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>${kind === 'cases' ? 'Заглавие' : 'Въпрос'}</th>
              <th>${kind === 'cases' ? 'Факти' : (kind === 'quizzes' ? 'Верен' : 'Отговор')}</th>
              <th>Тема</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>${filtered.length ? filtered.slice(0, 100).map(renderRow).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:32px;">Няма съвпадения</td></tr>'}</tbody>
        </table>
      </div>
      ${filtered.length > 100 ? `<p style="font-size:12px;color:var(--text-3);text-align:center;margin-top:8px;">Показани първите 100 от ${filtered.length}. Стесни търсенето за повече точност.</p>` : ''}
    </div>
  `;
}
window.__admGo = function (kind, subjId) { location.hash = '#/admin?tab=content&kind=' + kind + '&subj=' + subjId; };
window.__admSubj = function (subjId) {
  const p = new URLSearchParams((location.hash.split('?')[1]) || '');
  p.set('subj', subjId); p.delete('topic');
  location.hash = '#/admin?' + p.toString();
};
window.__admTopic = function (t) {
  const p = new URLSearchParams((location.hash.split('?')[1]) || '');
  if (t === '') p.delete('topic'); else p.set('topic', t);
  location.hash = '#/admin?' + p.toString();
};
window.__admSearch = function (q) {
  if (window.__admSearchT) clearTimeout(window.__admSearchT);
  window.__admSearchT = setTimeout(() => {
    const p = new URLSearchParams((location.hash.split('?')[1]) || '');
    if (q) p.set('q', q); else p.delete('q');
    location.hash = '#/admin?' + p.toString();
  }, 300);
};
window.__admEdit = function (kind, subjId, idx) {
  const item = (kind === 'flashcards' ? ContentStore.flashcards(subjId)
              : kind === 'cases' ? ContentStore.cases(subjId)
              : ContentStore.quiz(subjId))[idx];
  if (!item) return;
  showAdminEditModal(kind, subjId, idx, item);
};
window.__admDel = function (kind, subjId, idx) {
  if (!confirm('Изтриване на елемента? Това действие е обратимо чрез „Revert".')) return;
  ContentStore.deleteItem(kind, subjId, idx);
  toast('Изтрито');
  renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
};
window.__admAdd = function (kind, subjId) {
  let item;
  if (kind === 'flashcards') item = { q: '', a: '', topic: '', topicIdx: 0 };
  else if (kind === 'cases') item = { title: '', topicIdx: 0, facts: '', questions: [''], solution: '' };
  else item = { q: '', options: ['', '', '', ''], correct: 0, topicIdx: 0, explain: '' };
  showAdminEditModal(kind, subjId, -1, item, true);
};
window.__admRevert = function (kind, subjId) {
  if (!confirm('Да върна тази дисциплина към оригиналния data.js? Всички локални промени ще се загубят.')) return;
  ContentStore.revertOverride(kind, subjId);
  toast('Възстановено');
  renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
};
window.__admExport = function () {
  const D = window.PA_DATA || {};
  const merged = {
    chapters: D.chapters || {},
    conspectFull: D.conspectFull || {},
    flashcards: { ...(D.flashcards || {}), ...(state.contentOverrides.flashcards || {}) },
    quizzes: { ...(D.quizzes || {}), ...(state.contentOverrides.quizzes || {}) },
    cases: { ...(D.cases || {}), ...(state.contentOverrides.cases || {}) },
  };
  const header = '// Law+ — exported by admin on ' + new Date().toISOString() + '\n\nwindow.PA_DATA = {\n';
  let body = '';
  Object.keys(merged).forEach(k => { body += '  ' + k + ': ' + JSON.stringify(merged[k]) + ',\n'; });
  const out = header + body + '};\n';
  const blob = new Blob([out], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pravo-academy-data.js'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Файлът се сваля', true);
};

function showAdminEditModal(kind, subjId, idx, item, isNew) {
  const subj = SUBJECTS.find(s => s.id === subjId);
  const chapters = (subj && subj.chapters) || [];
  const fields = [];
  if (kind === 'flashcards') {
    fields.push({ key: 'q', label: 'Въпрос', type: 'textarea', val: item.q || '' });
    fields.push({ key: 'a', label: 'Отговор', type: 'textarea', val: item.a || '' });
    fields.push({ key: 'topicIdx', label: 'Тема', type: 'select', val: item.topicIdx ?? 0, options: chapters });
  } else if (kind === 'cases') {
    fields.push({ key: 'title', label: 'Заглавие', type: 'text', val: item.title || '' });
    fields.push({ key: 'topicIdx', label: 'Тема', type: 'select', val: item.topicIdx ?? 0, options: chapters });
    fields.push({ key: 'facts', label: 'Факти', type: 'textarea', val: item.facts || '' });
    fields.push({ key: 'questions_text', label: 'Въпроси (по един на ред)', type: 'textarea', val: (item.questions || []).join('\n') });
    fields.push({ key: 'solution', label: 'Решение', type: 'textarea', val: item.solution || '' });
  } else {
    fields.push({ key: 'q', label: 'Въпрос', type: 'textarea', val: item.q || '' });
    for (let i = 0; i < 4; i++) {
      fields.push({ key: 'option_' + i, label: 'Опция ' + bukvaOpcia(i) + (i === item.correct ? ' ✓ (верен)' : ''), type: 'text', val: (item.options || [])[i] || '' });
    }
    fields.push({ key: 'correct', label: 'Верен отговор', type: 'select_letter', val: item.correct ?? 0 });
    fields.push({ key: 'topicIdx', label: 'Тема', type: 'select', val: item.topicIdx ?? 0, options: chapters });
    fields.push({ key: 'explain', label: 'Обяснение', type: 'textarea', val: item.explain || '' });
  }

  const html = fields.map((f, fi) => {
    const id = 'adm-f-' + fi;
    if (f.type === 'textarea') return `<div class="field"><label>${f.label}</label><textarea id="${id}">${escapeHtml(String(f.val))}</textarea></div>`;
    if (f.type === 'text') return `<div class="field"><label>${f.label}</label><input id="${id}" type="text" value="${escapeHtml(String(f.val))}"></div>`;
    if (f.type === 'select') return `<div class="field"><label>${f.label}</label><select id="${id}">${f.options.map((o, oi) => `<option value="${oi}" ${oi === f.val ? 'selected' : ''}>${oi+1}. ${escapeHtml(o).slice(0,60)}</option>`).join('')}</select></div>`;
    if (f.type === 'select_letter') return `<div class="field"><label>${f.label}</label><select id="${id}">${['A','B','C','D'].map((l, li) => `<option value="${li}" ${li === f.val ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    return '';
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'adm-modal';
  modal.innerHTML = `
    <div class="adm-modal-inner">
      <h3>${isNew ? 'Добавяне' : 'Редакция'} · ${kind === 'flashcards' ? 'флашкарта' : (kind === 'cases' ? 'казус' : 'тестов въпрос')}</h3>
      ${html}
      <div class="adm-modal-actions">
        <button class="btn btn-outline" onclick="this.closest('.adm-modal').remove()">Отказ</button>
        <button class="btn btn-gold" id="admSave">${isNew ? 'Добави' : 'Запази'}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#admSave').addEventListener('click', () => {
    const patch = {};
    fields.forEach((f, fi) => {
      const v = modal.querySelector('#adm-f-' + fi).value;
      if (f.key === 'questions_text') patch.questions = v.split('\n').map(s => s.trim()).filter(Boolean);
      else if (f.key === 'topicIdx' || f.key === 'correct') patch[f.key] = parseInt(v, 10);
      else if (f.key.indexOf('option_') === 0) {
        if (!patch.options) patch.options = [...(item.options || ['','','',''])];
        patch.options[parseInt(f.key.split('_')[1], 10)] = v;
      } else patch[f.key] = v;
    });
    // Sync chapter title to topic field
    if (kind === 'flashcards' && chapters[patch.topicIdx]) patch.topic = chapters[patch.topicIdx];
    if (isNew) ContentStore.addItem(kind, subjId, patch);
    else ContentStore.updateItem(kind, subjId, idx, patch);
    modal.remove();
    toast(isNew ? 'Добавено' : 'Запазено', true);
    renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
  });
}

/* ---------- TAB: System ---------- */
function renderAdminSystem() {
  const lsSize = localStorageSize();
  const dataSize = JSON.stringify(window.PA_DATA || {}).length * 2; // rough
  const stateSize = JSON.stringify(state).length * 2;
  const eventCount = (state.events || []).length;
  const overridesCount = Object.keys(state.contentOverrides || {}).reduce((a,k) => a + Object.keys(state.contentOverrides[k] || {}).length, 0);

  $('#admMain').innerHTML = `
    <div class="adm-head">
      <div><h1>Система</h1><div class="sub">Техническа диагностика и инструменти</div></div>
    </div>

    <div class="adm-grid">
      <div class="adm-stat"><div class="k">localStorage</div><div class="v">${fmtBytes(lsSize)}</div><div class="d">от ~5 MB лимит</div></div>
      <div class="adm-stat"><div class="k">Data файл</div><div class="v">${fmtBytes(dataSize)}</div><div class="d">в памет</div></div>
      <div class="adm-stat"><div class="k">State</div><div class="v">${fmtBytes(stateSize)}</div><div class="d">твоя профил</div></div>
      <div class="adm-stat"><div class="k">Събития</div><div class="v">${eventCount}</div><div class="d">в event log</div></div>
    </div>

    <div class="adm-section">
      <h3>Backup и възстановяване</h3>
      <p style="color:var(--text-2);font-size:13px;line-height:1.6;margin-bottom:12px;">
        Свали целия state (прогрес, SRS, история, редакции) като JSON файл. Можеш да го качиш обратно по-късно или на друг компютър.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="window.__admBackup()">📥 Свали state.json</button>
        <button class="btn btn-outline" onclick="document.getElementById('admRestoreFile').click()">📤 Качи state.json</button>
        <input type="file" id="admRestoreFile" accept=".json" style="display:none;" onchange="window.__admRestore(this.files[0])">
        <button class="btn btn-outline" onclick="window.__admExport()">📥 Export data.js</button>
      </div>
    </div>

    <div class="adm-section">
      <h3>Локални промени по съдържанието</h3>
      ${overridesCount === 0
        ? '<p style="color:var(--text-3);font-size:13px;">Няма локални промени. Цялото съдържание идва от data.js.</p>'
        : `<p style="color:var(--text-2);font-size:13px;margin-bottom:10px;">Имаш ${overridesCount} override-а. Натисни „Export data.js" за да създадеш нов data файл, който включва промените, или „Revert all" за да ги изхвърлиш.</p>
           <button class="adm-btn-sm danger" onclick="window.__admRevertAll()">↩ Revert всички промени</button>`}
    </div>

    <div class="adm-section">
      <h3>Опасна зона</h3>
      <p style="color:var(--text-2);font-size:13px;margin-bottom:12px;">Тези операции не са обратими.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="adm-btn-sm danger" onclick="window.__admClearEvents()">🗑 Изчисти event log</button>
        <button class="adm-btn-sm danger" onclick="window.__admClearProgress()">🗑 Нулирай моя прогрес</button>
        <button class="adm-btn-sm danger" onclick="window.__admClearAll()">⚠ Изтрий целия state</button>
      </div>
    </div>

    <div class="adm-section">
      <h3>Към продажба — roadmap</h3>
      <div style="font-size:13px;color:var(--text-2);line-height:1.7;">
        <p><strong>Фаза 1 — Backend и auth (1-2 седмици).</strong> Supabase setup, миграция на schema (users, progress, srs_state, purchases), Stripe Checkout, hosting (Netlify/Vercel).</p>
        <p><strong>Фаза 2 — Защита на съдържанието.</strong> Премести pravo-academy-data.js зад authentication; API endpoints за on-demand зареждане; watermark/personalization.</p>
        <p><strong>Фаза 3 — Правни документи.</strong> Условия за ползване, GDPR Privacy Policy, ЗДДС регистрация (с счетоводител), ИКЕ-фактуриране.</p>
        <p><strong>Фаза 4 — Маркетинг.</strong> Landing page, SEO, реклама, партньорства с факултети.</p>
      </div>
    </div>
  `;

  // Здраве на връзката със сървъра (асинхронно)
  (function() {
    const host = document.getElementById('admMain');
    if (!host) return;
    const box = document.createElement('div');
    box.className = 'adm-section';
    box.innerHTML = '<h3>Здраве на връзката</h3><div id="admHealth" style="font-size:13px;color:var(--text-3);">Проверявам…</div>';
    host.appendChild(box);
    (async () => {
      const el = document.getElementById('admHealth');
      if (!el) return;
      const t0 = performance.now();
      let online = false;
      try { online = await backendReady(); } catch (e) {}
      const ms = Math.round(performance.now() - t0);
      const row = (label, ok, extra) => '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid var(--border);"><span>' + label + '</span><span>' + (ok === true ? '<span style="color:var(--green);">✓ ОК</span>' : ok === false ? '<span style="color:var(--red);">✗ Не</span>' : escapeHtml(String(ok))) + (extra ? ' <span style="color:var(--text-3);">' + extra + '</span>' : '') + '</span></div>';
      let html = row('Backend сървър', online, online ? ms + ' ms' : 'демо режим');
      if (online) {
        try {
          const r = await apiFetch('/api/admin/health');
          const d = r.data || {};
          html += row('База данни', !!d.db);
          html += row('Stripe ключове', !!d.stripe);
          html += row('SMTP (имейли)', !!d.smtp);
          html += row('AI асистент', d.ai === 'real' ? true : d.ai === 'stub' ? 'демо (стаб)' : false);
          if (d.last_webhook) html += row('Последен Stripe webhook', new Date(d.last_webhook).toLocaleString('bg-BG'));
          if (typeof d.uptime === 'number') html += row('Uptime', Math.floor(d.uptime / 3600) + ' ч ' + Math.floor((d.uptime % 3600) / 60) + ' мин');
        } catch (e) {
          html += '<div style="padding:6px 0;color:var(--text-3);">Разширената диагностика изисква admin акаунт на сървъра (' + escapeHtml(e.message || '') + ')</div>';
        }
      } else {
        html += '<div style="padding:6px 0;color:var(--text-3);">Сайтът работи в демо режим — всичко се пази в браузъра. При пуснат сървър тук се вижда състоянието на базата, Stripe и имейлите.</div>';
      }
      el.innerHTML = html;
    })();
  })();
}
window.__admBackup = function () {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pravo-academy-state-' + todayStr() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup свален', true);
};
window.__admRestore = function (file) {
  if (!file) return;
  if (!confirm('Качването ще замени текущия state. Сигурен ли си?')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      Object.assign(state, data);
      saveState();
      toast('State възстановен', true);
      renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
    } catch (err) { toast('Грешка: ' + err.message); }
  };
  reader.readAsText(file);
};
window.__admRevertAll = function () {
  if (!confirm('Изхвърляне на ВСИЧКИ локални промени по съдържанието?')) return;
  state.contentOverrides = {};
  saveState();
  toast('Възстановено');
  renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
};
window.__admClearEvents = function () {
  if (!confirm('Изтриване на целия event log?')) return;
  state.events = [];
  saveState();
  toast('Event log изчистен');
  renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
};
window.__admClearProgress = function () {
  if (!confirm('Нулиране на SRS, флашкарти, теми, теглия билет, streak? Закупените пакети остават.')) return;
  state.srs = {}; state.srsConfig = {}; state.srsToday = {};
  state.fcDeck = {}; state.fcMastered = {};
  state.topicCompleted = {}; state.lastTopic = {};
  state.streakDays = []; state.examDrawHistory = {};
  state.events = [];
  saveState();
  toast('Прогресът нулиран');
  renderAdmin(new URLSearchParams((location.hash.split('?')[1]) || ''));
};
window.__admClearAll = function () {
  if (!confirm('ВНИМАНИЕ: Това ще изтрие всичко — твоя профил, прогрес, редакции. Ще те изхвърли. Сигурен ли си?')) return;
  if (!confirm('Наистина сигурен?')) return;
  localStorage.removeItem(STATE_KEY);
  location.hash = '#/'; location.reload();
};

export { adminContentCounts, adminSrsTotals, renderAdmin, renderAdminContent, renderAdminOverview, renderAdminProgress, renderAdminSales, renderAdminSupport, renderAdminSystem, renderAdminUsers, showAdminEditModal };
