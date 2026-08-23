/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getMistakes, recordMistake } from './08-tetradka-na-greshkite.js';
import { PA_BACKEND_URL, backendReady, getJwt, saveState } from './09-backend-integraciya.js';
import { $, el, escapeHtml, progressOf, ringSvg } from './10-helpers.js';
import { iconSvg } from './27-page.js';

/* ============================================================
   AI АСИСТЕНТ v2 — истински работещ, в два режима:
   1) СЪРВЪРЕН — при работещ backend пита истинския AI (Claude)
      с реални откъси от конспекта + историята на разговора.
   2) ЛОКАЛЕН — без сървър асистентът ПАК работи: търси във
      вградените материали (конспекти, флашкарти, тестове, казуси),
      обяснява теми, прави мини-тестове в чата, симулира устен
      изпит и анализира слабите места от тетрадката на грешките.
   ============================================================ */

function aiBubbleHTML() {
  return [
    '<button class="ai-bubble" id="aiBubble" title="AI асистент">',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l1.5 5L18 9.5 13.5 11 12 16l-1.5-5L6 9.5 10.5 8z"/><path d="M19 17l.6 2L21 19.6 19.6 20 19 22 18.4 20 17 19.6 18.4 19z"/></svg>',
    '</button>',
    '<div class="ai-panel" id="aiPanel">',
      '<div class="ai-head">',
        '<div class="ai-avatar">',
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l1.5 5L18 9.5 13.5 11 12 16l-1.5-5L6 9.5 10.5 8z"/></svg>',
        '</div>',
        '<div style="flex:1;">',
          '<h4>AI Асистент</h4>',
          '<div class="ai-status" id="aiStatus">● зареждам…</div>',
        '</div>',
        '<button class="icon-btn" id="aiReset" title="Нов разговор" style="color:#fff;">',
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/></svg>',
        '</button>',
        '<button class="icon-btn" id="aiClose" style="color:#fff;">',
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '</button>',
      '</div>',
      '<div class="ai-demo-bar" id="aiDemoBar" style="display:none;">⚠ <strong>Демо режим</strong> — отговорите се извличат от учебните материали в сайта. Пълният AI асистент се активира, когато сайтът бъде пуснат онлайн.</div>',
      '<div class="ai-body" id="aiBody"></div>',
      '<div class="ai-input-row">',
        '<input class="input" placeholder="Задай въпрос…" id="aiInput" maxlength="600">',
        '<button class="btn btn-gold btn-sm" id="aiSend">Прати</button>',
      '</div>',
    '</div>'
  ].join('');
}

const PA_API_URL = PA_BACKEND_URL;

/* ---------- Помощници: чат лента ---------- */
function aiChatLog() { if (!state.aiChat) state.aiChat = []; return state.aiChat; }

function aiPushRaw(role, html, opts) {
  const body = $('#aiBody');
  if (!body) return null;
  const div = document.createElement('div');
  div.className = 'ai-msg' + (role === 'u' ? ' user' : '');
  div.innerHTML = html;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  if (!opts || !opts.ephemeral) {
    const log = aiChatLog();
    log.push({ r: role, h: html });
    while (log.length > 30) log.shift();
    saveState();
  }
  return div;
}

/* Ефект на писане: постепенно показва отговора (дума по дума) */
function aiTypeInto(div, html) {
  return new Promise(resolve => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const finalHTML = html;
    const text = tmp.textContent || '';
    if (text.length < 60) { div.innerHTML = finalHTML; resolve(); return; }
    const words = text.split(' ');
    let i = 0;
    div.textContent = '';
    const step = Math.max(1, Math.round(words.length / 40));
    const t = setInterval(() => {
      i += step;
      if (i >= words.length) {
        clearInterval(t);
        div.innerHTML = finalHTML; // финално: пълният формат с линкове/болд
        resolve();
      } else {
        div.textContent = words.slice(0, i).join(' ') + '…';
      }
      const body = $('#aiBody'); if (body) body.scrollTop = body.scrollHeight;
    }, 30);
  });
}

function aiTypingIndicator() {
  return aiPushRaw('a', '<span class="ai-dots"><span></span><span></span><span></span></span>', { ephemeral: true });
}

/* Markdown-lite: **болд**, редове с "- " → •, нови редове → <br> */
function aiFormat(text) {
  let h = escapeHtml(String(text || ''));
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.split('\n').map(line => {
    const m = line.match(/^\s*[-•]\s+(.*)$/);
    return m ? '<span class="ai-li">• ' + m[1] + '</span>' : line;
  }).join('<br>');
  h = h.replace(/(<br>){3,}/g, '<br><br>');
  return h;
}

/* ---------- Локален двигател: търсене във вградените материали ---------- */
const AI_STOP = new Set(('и в на за от с по да се е са какво каква какви какъв що как кой коя кое кои това този тази тези или ако при като че ми ме теб той тя то ние вие те му ѝ им ги го я не ни ли пък бе без до из над под пред зад чрез след преди между у ще съм си сте сме бъде бил била било били беше бяха обясни разкажи дай представлява значи означава наричаме дефиниция определение прости думи тема темата въпрос въпроса пример примери сравни сравнение разлика разликата разликите прилика приликата различават отличава').split(' '));

function aiStem(w) {
  let s = w;
  const sufs = ['ческият','ческия','ческата','ческото','ческите','ически','ичните','ността','остта','ирането','ирания','ирана','ирано','ирани','иране','ението','енията','ението','ението','ията','ията','ните','ният','ната','ното','ият','ите','ото','ата','ето','ята','та','то','те','ът','ят','ия'];
  for (const suf of sufs) {
    if (s.length - suf.length >= 4 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s;
}

function aiStrip(x) { return String(x || '').replace(/<[^>]+>/g, ''); }

function aiTok(text) {
  return String(text || '').toLowerCase().split(/[^а-яёa-z0-9]+/)
    .filter(w => w.length >= 3 && !AI_STOP.has(w))
    .map(aiStem);
}

let __aiIdx = null;
function aiIndex() {
  if (__aiIdx) return __aiIdx;
  const idx = { topics: [] };
  try {
    const D = window.PA_DATA || {};
    SUBJECTS.forEach(subj => {
      const con = (D.conspectFull && D.conspectFull[subj.id]) || [];
      con.forEach((t, ti) => {
        const secTitles = (t.sections || []).map(x => x.title || '').join(' ');
        idx.topics.push({
          sid: subj.id, sname: subj.name, ti,
          heading: t.heading || '',
          toks: aiTok((t.heading || '') + ' ' + secTitles),
        });
      });
      // дисциплини само с глави (без пълен конспект)
      if (!con.length && D.chapters && D.chapters[subj.id]) {
        D.chapters[subj.id].forEach((h, ti) => {
          idx.topics.push({ sid: subj.id, sname: subj.name, ti, heading: h, toks: aiTok(h) });
        });
      }
    });
  } catch (e) { /* индексът е опционален */ }
  __aiIdx = idx;
  return idx;
}

/* Ако въпросът назовава дисциплина по име („по облигационно право“) — намери я */
function aiMatchSubject(question) {
  const q = aiTok(question);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  SUBJECTS.forEach(subj => {
    const toks = aiTok(subj.name);
    let score = 0;
    q.forEach(st => { if (toks.some(dt => dt.startsWith(st) || st.startsWith(dt))) score++; });
    // изискваме поне 2 съвпадения (напр. „облигацион“ + „право“ е твърде общо само с 1)
    if (score >= 2 && score > bestScore) { bestScore = score; best = subj.id; }
  });
  return best;
}

function aiCurrentSubject() {
  const m = location.hash.match(/\/(subject|flashcards|conspect|quiz|cases|exam-setup|exam-draw|review|notes|mistakes-review)\/([a-z]+)/);
  return m ? m[2] : null;
}

function aiMatchTopics(question, limit) {
  const q = aiTok(question);
  if (!q.length) return [];
  const cur = aiCurrentSubject();
  const scored = aiIndex().topics.map(t => {
    let score = 0;
    q.forEach(st => { if (t.toks.some(dt => dt.startsWith(st) || st.startsWith(dt))) score++; });
    if (score > 0 && cur && t.sid === cur) score += 3;
    if (score > 0 && __aiScope && __aiScope.sids.includes(t.sid)) score += 2;
    return { t, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit || 3).map(x => x.t);
}

/* Пълният текст на тема — за отговори и за context към сървъра */
function aiTopicText(sid, ti, cap) {
  try {
    const t = ((window.PA_DATA.conspectFull || {})[sid] || [])[ti];
    if (!t) return '';
    let out = [];
    (t.sections || []).forEach(sec => {
      (sec.blocks || []).forEach(b => { if (b.text) out.push(b.text); });
    });
    return out.join('\n').slice(0, cap || 3000);
  } catch (e) { return ''; }
}

function aiFindCard(question, sid) {
  try {
    const q = aiTok(aiStrip(question));
    if (!q.length) return null;
    const D = window.PA_DATA || {};
    let best = null, bestScore = 0;
    const pools = sid ? [sid] : SUBJECTS.map(s => s.id).filter(aiInScope);
    pools.forEach(id => {
      ((D.flashcards || {})[id] || []).forEach(c => {
        const toks = aiTok(aiStrip(c.q) + ' ' + aiStrip(c.topic || ''));
        let score = 0;
        q.forEach(st => { if (toks.some(dt => dt.startsWith(st) || st.startsWith(dt))) score++; });
        if (score > bestScore) { bestScore = score; best = { ...c, sid: id }; }
      });
    });
    // при въпрос от 1 дума — 1 съвпадение стига; иначе — поне 2
    return bestScore >= Math.min(2, q.length) ? best : null;
  } catch (e) { return null; }
}

function aiFindCase(question) {
  try {
    const generic = new Set(['казус', 'казуси', 'практик', 'пример', 'упражнени', 'съдебн']);
    const q = aiTok(question).filter(w => !generic.has(w));
    if (!q.length) return null;
    const D = window.PA_DATA || {};
    const cur = aiCurrentSubject();
    let best = null, bestScore = 0;
    Object.keys(D.cases || {}).forEach(id => {
      (D.cases[id] || []).forEach(c => {
        const toks = aiTok((c.title || '') + ' ' + String(c.facts || '').slice(0, 300));
        let score = 0;
        q.forEach(st => { if (toks.some(dt => dt.startsWith(st) || st.startsWith(dt))) score++; });
        if (cur && id === cur) score += 1;
        if (score > bestScore) { bestScore = score; best = { ...c, sid: id }; }
      });
    });
    return best;
  } catch (e) { return null; }
}

/* ---------- Локални „умения“ ---------- */

function aiSubjName(sid) { const s = SUBJECTS.find(x => x.id === sid); return s ? s.name : sid; }

function aiAnswerExplain(question) {
  const topics = aiMatchTopics(question, 3);
  const card = aiFindCard(question, topics[0] ? topics[0].sid : null);
  if (!topics.length && !card) return null;

  let html = '';
  if (card) {
    html += '<strong>' + escapeHtml(aiStrip(card.topic || card.q)) + '</strong> <span class="ai-tag">' + escapeHtml(aiSubjName(card.sid)) + '</span><br>' + escapeHtml(aiStrip(card.a).slice(0, 600));
  }
  const top = topics[0];
  if (top) {
    const body = aiTopicText(top.sid, top.ti, 700);
    if (!card && body) {
      html += '<strong>' + escapeHtml(top.heading) + '</strong> <span class="ai-tag">' + escapeHtml(top.sname) + '</span><br>' + escapeHtml(body);
      if (body.length >= 700) html += '…';
    }
    html += '<div class="ai-actions">' +
      '<a class="ai-act" href="#/conspect/' + top.sid + '?chapter=' + top.ti + '">📖 Отвори темата</a>' +
      '<button class="ai-act" onclick="window.__aiQuizStart(\'' + top.sid + '\', ' + top.ti + ')">✏️ Тества́й ме</button>' +
      '<a class="ai-act" href="#/flashcards/' + top.sid + '?topic=' + top.ti + '">🃏 Флашкарти</a>' +
      '</div>';
    if (topics.length > 1) {
      html += '<div class="ai-more">Свързани теми: ' + topics.slice(1).map(t =>
        '<a href="#/conspect/' + t.sid + '?chapter=' + t.ti + '">' + escapeHtml(t.heading.slice(0, 60)) + '</a>'
      ).join(' · ') + '</div>';
    }
  }
  return html || null;
}

function aiAnswerWeakSpots() {
  const m = getMistakes();
  const sids = Object.keys(m);
  if (!sids.length) {
    return 'Добра новина — <strong>тетрадката ти на грешките е празна</strong>! 🎉<br>' +
      'Когато сбъркаш въпрос в тест, той се записва там автоматично и аз ще мога да ти покажа къде бъркаш най-често.' +
      '<div class="ai-actions"><button class="ai-act" onclick="window.__aiQuizStart(null, null)">✏️ Пробен мини-тест</button></div>';
  }
  const perSubj = sids.map(sid => ({
    sid,
    items: m[sid],
    count: m[sid].length,
    repeats: m[sid].reduce((n, x) => n + (x.times || 1), 0),
  })).sort((a, b) => b.repeats - a.repeats);

  let html = '<strong>Анализ на слабите места</strong> (от тетрадката на грешките):<br>';
  perSubj.slice(0, 3).forEach(s => {
    html += '<span class="ai-li">• <strong>' + escapeHtml(aiSubjName(s.sid)) + '</strong> — ' + s.count + ' ' + (s.count === 1 ? 'сбъркан въпрос' : 'сбъркани въпроса');
    const topTopics = {};
    s.items.forEach(it => { if (typeof it.topicIdx === 'number') topTopics[it.topicIdx] = (topTopics[it.topicIdx] || 0) + (it.times || 1); });
    const worst = Object.entries(topTopics).sort((a, b) => b[1] - a[1])[0];
    if (worst) {
      const ch = ((window.PA_DATA.chapters || {})[s.sid] || [])[worst[0]];
      if (ch) html += ' (най-често: „' + escapeHtml(String(ch).slice(0, 50)) + '“)';
    }
    html += '</span>';
  });
  const worstSid = perSubj[0].sid;
  html += '<div class="ai-actions">' +
    '<a class="ai-act" href="#/mistakes">📓 Тетрадка на грешките</a>' +
    '<button class="ai-act" onclick="window.__aiQuizStart(\'' + worstSid + '\', null)">✏️ Тест по ' + escapeHtml(aiSubjName(worstSid).slice(0, 24)) + '</button>' +
    '</div>';
  return html;
}

function aiCaseHtml(c) {
  return '<strong>Казус: ' + escapeHtml(c.title || '') + '</strong> <span class="ai-tag">' + escapeHtml(aiSubjName(c.sid)) + '</span><br>' +
    escapeHtml(String(c.facts || '').slice(0, 420)) + '…' +
    '<div class="ai-actions"><a class="ai-act" href="#/cases/' + c.sid + '">⚖️ Пълният казус и решението</a>' +
    '<button class="ai-act" onclick="window.__aiAnotherCase()">🎲 Друг казус</button></div>';
}

window.__aiAnotherCase = function() {
  const c = aiRandomCase();
  if (c) aiPushRaw('a', aiCaseHtml(c), { ephemeral: true });
};

function aiRandomCase() {
  const D = window.PA_DATA || {};
  const cur = aiCurrentSubject();
  let pool = [];
  if (cur && (D.cases || {})[cur] && D.cases[cur].length) {
    pool = D.cases[cur].map(c => ({ ...c, sid: cur }));
  } else {
    Object.keys(D.cases || {}).forEach(id => {
      (D.cases[id] || []).forEach(c => pool.push({ ...c, sid: id }));
    });
  }
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function aiAnswerCase(question) {
  const c = aiFindCase(question) || aiRandomCase();
  if (!c) return null;
  return aiCaseHtml(c);
}

/* Мини-тест в чата */
window.__aiQuizStart = function(sid, topicIdx) {
  const D = window.PA_DATA || {};
  if (!sid) {
    const cur = aiCurrentSubject();
    sid = cur || (Object.keys(D.quizzes || {})[0]);
  }
  let pool = ((D.quizzes || {})[sid] || []).filter(q => q.options && typeof q.correct === 'number');
  if (!pool.length) {
    // тази дисциплина няма въпроси с опции → първата, която има
    const alt = SUBJECTS.map(x => x.id).find(id =>
      ((D.quizzes || {})[id] || []).some(q => q.options && typeof q.correct === 'number'));
    if (alt) {
      sid = alt;
      topicIdx = null;
      pool = D.quizzes[sid].filter(q => q.options && typeof q.correct === 'number');
    }
  }
  if (topicIdx !== null && topicIdx !== undefined) {
    const byTopic = pool.filter(q => q.topicIdx === topicIdx);
    if (byTopic.length >= 2) pool = byTopic;
  }
  if (!pool.length) { aiPushRaw('a', 'По тази дисциплина още няма тестови въпроси.', { ephemeral: true }); return; }
  const queue = pool.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  window.__aiQuiz = { sid, queue, at: 0, right: 0 };
  aiPushRaw('a', '<strong>Мини-тест по ' + escapeHtml(aiSubjName(sid)) + '</strong> — ' + queue.length + ' въпроса. Успех! 🍀', { ephemeral: true });
  aiQuizNext();
};

function aiQuizNext() {
  const st = window.__aiQuiz;
  if (!st) return;
  if (st.at >= st.queue.length) {
    const pct = Math.round(st.right / st.queue.length * 100);
    aiPushRaw('a', '<strong>Резултат: ' + st.right + ' / ' + st.queue.length + '</strong> (' + pct + '%). ' +
      (pct === 100 ? 'Отлично! 🏆' : pct >= 60 ? 'Добре се справяш — сбърканите отидоха в тетрадката на грешките.' : 'Има какво да догониш — сбърканите са в тетрадката на грешките.') +
      '<div class="ai-actions"><button class="ai-act" onclick="window.__aiQuizStart(\'' + st.sid + '\', null)">🔁 Още един тест</button>' +
      '<a class="ai-act" href="#/mistakes">📓 Грешките ми</a></div>', { ephemeral: true });
    window.__aiQuiz = null;
    return;
  }
  const q = st.queue[st.at];
  const opts = q.options.map((o, i) =>
    '<button class="ai-quiz-opt" data-i="' + i + '" onclick="window.__aiQuizPick(this, ' + i + ')">' +
    '<span class="ai-quiz-letter">' + 'АБВГДЕ'[i] + '</span> ' + escapeHtml(String(o).slice(0, 160)) + '</button>'
  ).join('');
  aiPushRaw('a', '<strong>Въпрос ' + (st.at + 1) + '/' + st.queue.length + ':</strong> ' + escapeHtml(q.q) + '<div class="ai-quiz">' + opts + '</div>', { ephemeral: true });
}

window.__aiQuizPick = function(btn, i) {
  const st = window.__aiQuiz;
  if (!st) return;
  const q = st.queue[st.at];
  const wrap = btn.parentElement;
  if (wrap.dataset.done) return;
  wrap.dataset.done = '1';
  [...wrap.children].forEach((b, bi) => {
    b.disabled = true;
    if (bi === q.correct) b.classList.add('right');
    else if (bi === i) b.classList.add('wrong');
  });
  if (i === q.correct) { st.right++; }
  else { try { recordMistake(st.sid, q); } catch (e) {} }
  st.at++;
  setTimeout(aiQuizNext, 900);
};

/* Устен изпит в чата */
window.__aiOralStart = function(sid) {
  const D = window.PA_DATA || {};
  if (!sid) sid = aiCurrentSubject();
  if (!sid || !((D.flashcards || {})[sid] || []).length) {
    const withCards = SUBJECTS.filter(s => ((D.flashcards || {})[s.id] || []).length);
    aiPushRaw('a', 'По коя дисциплина да те изпитвам?<div class="ai-actions">' +
      withCards.slice(0, 6).map(s => '<button class="ai-act" onclick="window.__aiOralStart(\'' + s.id + '\')">' + escapeHtml(s.name.slice(0, 30)) + '</button>').join('') +
      '</div>', { ephemeral: true });
    return;
  }
  const pool = (D.flashcards[sid] || []).slice().sort(() => Math.random() - 0.5).slice(0, 5);
  window.__aiOral = { sid, queue: pool, at: 0, known: 0 };
  aiPushRaw('a', '<strong>Устен изпит по ' + escapeHtml(aiSubjName(sid)) + '</strong> — ще ти задам ' + pool.length + ' въпроса. Отговори наум (или на глас!), после провери. 🎓', { ephemeral: true });
  aiOralNext();
};

function aiOralNext() {
  const st = window.__aiOral;
  if (!st) return;
  if (st.at >= st.queue.length) {
    aiPushRaw('a', '<strong>Край на изпита: ' + st.known + ' / ' + st.queue.length + ' знаеше.</strong> ' +
      (st.known === st.queue.length ? 'Готов си за залата! 🏆' : 'Прегледай темите, на които се поколеба.') +
      '<div class="ai-actions"><button class="ai-act" onclick="window.__aiOralStart(\'' + st.sid + '\')">🔁 Нов изпит</button></div>', { ephemeral: true });
    window.__aiOral = null;
    return;
  }
  const c = st.queue[st.at];
  aiPushRaw('a', '<strong>Въпрос ' + (st.at + 1) + ':</strong> ' + escapeHtml(aiStrip(c.q)) +
    '<div class="ai-actions"><button class="ai-act" onclick="window.__aiOralReveal(this)">👁 Покажи отговора</button></div>', { ephemeral: true });
}

window.__aiOralReveal = function(btn) {
  const st = window.__aiOral;
  if (!st) return;
  const c = st.queue[st.at];
  const row = btn.parentElement;
  row.outerHTML = '<div class="ai-oral-answer">' + escapeHtml(aiStrip(c.a).slice(0, 500)) + '</div>' +
    '<div class="ai-actions">' +
    '<button class="ai-act" onclick="window.__aiOralGrade(1)">✓ Знаех</button>' +
    '<button class="ai-act" onclick="window.__aiOralGrade(0)">✗ Не знаех</button>' +
    '</div>';
};

window.__aiOralGrade = function(knew) {
  const st = window.__aiOral;
  if (!st) return;
  if (knew) st.known++;
  st.at++;
  aiOralNext();
};

/* ---------- Интерактивни умения — работят ВИНАГИ локално,
   дори при жив сървър (Claude не може да рендира кликаеми тестове) ---------- */
function aiTryInteractive(question) {
  const q = question.toLowerCase();

  if (/слаб|бъркам|греш|къде куцам|не ми върви/.test(q)) return aiAnswerWeakSpots();

  if (/тест|въпроси|провери ме|попитай ме|куиз|quiz/.test(q)) {
    const subjHit = aiMatchSubject(question) || (__aiScope && __aiScope.strict ? __aiScope.sids[0] : null);
    if (subjHit) { window.__aiQuizStart(subjHit, null); return ''; }
    const topics = aiMatchTopics(question, 1);
    window.__aiQuizStart(topics[0] ? topics[0].sid : aiCurrentSubject(), topics[0] ? topics[0].ti : null);
    return '';
  }

  if (/устен|изпитай ме|симулирай|изпитване/.test(q)) {
    window.__aiOralStart(aiMatchSubject(question) || (__aiScope && __aiScope.strict ? __aiScope.sids[0] : null) || aiCurrentSubject());
    return '';
  }

  if (/казус|практика|съдебн|пример от/.test(q)) {
    const c = aiAnswerCase(question);
    if (c) return c;
  }

  return null; // не е интерактивно — свободен въпрос
}

/* ---------- Сравнение на две понятия ---------- */
function aiParseCompare(question) {
  const q = question.toLowerCase().replace(/[?!.]+$/, '').trim();
  if (!/сравни|разлика|различават|отличава|прилика|\bvs\b|спрямо/.test(q)) return null;
  // махни уводните думи („каква е разликата между…“, „сравни ми…“)
  let rest = q.replace(/^.*?(?:сравни(?:ш)?(?:\s+ми)?|разлик[а-я]*|прилик[а-я]*|различават(?:\s+се)?|отличава)\s*(?:между|на)?\s*/, '');
  if (!rest || rest === q) rest = q;
  rest = rest.replace(/^(?:каква\s+е|какви\s+са|какво\s+е|ми|е|са)\s+/, '').replace(/^(?:между|на)\s+/, '');
  // законът е уловен вече в обхвата — махни го от самите термини („по ЗЗД“, „в НК“)
  rest = rest.replace(/\s+(?:в|по|от|съгласно|на)\s+(?:нк|нпк|ззд|зс|крб|апк|гпк|тз|ск|кт|зинзс|конституцията)(?=[^а-яa-z]|$)\.?/gi, '');
  const parts = rest.split(/\s+(?:срещу|спрямо|vs\.?|и|със|от)\s+/)
    .map(x => x.trim().replace(/^(се|са|е)\s+/, ''))
    .filter(x => x.length >= 3);
  if (parts.length < 2) return null;
  return parts.slice(0, 2);
}

/* ---------- Пълнотекстов индекс на конспектите (кеширан) ---------- */
/* ---------- Обхват на търсене: законът от въпроса или отвореният курс ---------- */
let __aiScope = null;

const AI_LAWS = [
  { rx: /(^|[^а-яa-z])нк($|[^а-яa-z])/i, subj: /наказателно право/i, label: 'НК · Наказателно право' },
  { rx: /(^|[^а-яa-z])нпк($|[^а-яa-z])/i, subj: /наказателен процес/i, label: 'НПК · Наказателен процес' },
  { rx: /(^|[^а-яa-z])ззд($|[^а-яa-z])/i, subj: /облигационно|гражданско право/i, label: 'ЗЗД' },
  { rx: /(^|[^а-яa-z])зс($|[^а-яa-z])/i, subj: /вещно/i, label: 'ЗС · Вещно право' },
  { rx: /(^|[^а-яa-z])(крб|конституцията)($|[^а-яa-z])/i, subj: /конституционно/i, label: 'КРБ' },
  { rx: /(^|[^а-яa-z])апк($|[^а-яa-z])/i, subj: /административен процес|административно право/i, label: 'АПК' },
  { rx: /(^|[^а-яa-z])зизн($|[^а-яa-z])/i, subj: /наказателно изпълнително/i, label: 'ЗИНЗС' },
];

function aiDetectScope(question) {
  const q = ' ' + String(question || '').toLowerCase() + ' ';
  // 1) изрично назован закон → строг обхват върху съответния курс
  for (const L of AI_LAWS) {
    if (L.rx.test(q)) {
      const sids = SUBJECTS.filter(x => L.subj.test(x.name)).map(x => x.id);
      if (sids.length) return { sids, strict: true, label: L.label };
    }
  }
  // 2) иначе — отвореният в момента курс (мек обхват: пада към всички при липса)
  const cur = aiCurrentSubject();
  if (cur) return { sids: [cur], strict: false, label: aiSubjName(cur) };
  return null;
}

function aiInScope(sid) { return !__aiScope || __aiScope.sids.includes(sid); }

let __aiFull = null;
function aiFullIndex() {
  if (__aiFull) return __aiFull;
  const out = [];
  try {
    const D = window.PA_DATA || {};
    Object.keys(D.conspectFull || {}).forEach(sid => {
      (D.conspectFull[sid] || []).forEach((t, ti) => {
        const txt = [];
        (t.sections || []).forEach(sec => (sec.blocks || []).forEach(bl => { if (bl.text) txt.push(aiStrip(bl.text)); }));
        const text = txt.join('\n');
        out.push({ sid, ti, heading: t.heading || '', text, lower: text.toLowerCase(), sents: null });
      });
    });
  } catch (e) { /* индексът е опционален */ }
  __aiFull = out;
  return out;
}

/* Разделя на изречения; „чл. 26“ и „ал. 1“ не късат изречението */
function aiSentences(topic) {
  if (topic.sents) return topic.sents;
  topic.sents = topic.text
    .replace(/([.!?])\s+(?=[А-ЯA-Z])/g, '$1¶')
    .split(/¶|\n+/)
    .map(x => x.trim())
    .filter(x => x.length > 30 && x.length < 600);
  return topic.sents;
}

/* Търсач на понятие: ключове от стеблата + regex за начало на дума */
function aiMatcherKey(word) {
  let k = word;
  // съществителни на -ост: нищожност → нищожн (хваща нищожни, нищожна…)
  if (k.length > 7 && k.endsWith('ост')) k = k.slice(0, -3);
  // отрежи крайните гласни до корен ≥5 букви: кражба → кражб, владение → владен
  while (k.length > 5 && 'аеиоуъюя'.includes(k[k.length - 1])) k = k.slice(0, -1);
  return k;
}

function aiTermMatcher(term) {
  // „чл. 215“ / „чл.215“ → съвпада ТОЧНО този член, не произволно число
  const art = aiStrip(term).toLowerCase().match(/чл\.?\s*(\d+[а-яa-z]?)/);
  if (art) {
    const num = art[1];
    const rx = new RegExp('чл\\.?\\s*' + num + '(?![0-9а-яё])', 'i');
    return {
      term: 'чл. ' + num, keys: [num], ok: true, isArticle: true,
      test(lower) { return rx.test(lower); },
      hl: new RegExp('(чл\\.?\\s*' + num + ')(?![0-9а-яё])', 'gi'),
    };
  }
  const words = aiStrip(term).toLowerCase().split(/[^а-яёa-z0-9]+/)
    .filter(w => w.length >= 3 && !AI_STOP.has(w));
  const keys = words.map(aiMatcherKey);
  const regs = keys.map(k => new RegExp('(^|[^а-яa-zё])' + k, 'i'));
  return {
    term, keys,
    ok: keys.length > 0,
    test(lower) { return regs.length > 0 && regs.every(r => r.test(lower)); },
  };
}

/* Откроява понятията в (вече escape-нат) текст */
function aiHighlight(escaped, matchers) {
  let out = escaped;
  matchers.forEach(M => {
    if (M.hl) { out = out.replace(M.hl, '<strong>$1</strong>'); return; }
    M.keys.forEach(k => {
      out = out.replace(new RegExp('(^|[^А-Яа-яA-Za-zё])(' + k + '[а-яА-Яё]*)', 'gi'), '$1<strong>$2</strong>');
    });
  });
  return out;
}

/* Топ теми за понятие — по брой споменавания в пълния текст */
function aiTopicsForTerm(M, cap) {
  const cur = aiCurrentSubject();
  let pool = aiFullIndex().filter(t => aiInScope(t.sid));
  let hits = pool.filter(t => M.test(t.lower));
  // мек обхват без резултат → потърси във всички курсове
  if (!hits.length && __aiScope && !__aiScope.strict) {
    hits = aiFullIndex().filter(t => M.test(t.lower));
  }
  return hits
    .map(t => {
      let n = 0, i = -1;
      const key = M.keys[0];
      while ((i = t.lower.indexOf(key, i + 1)) !== -1 && n < 30) n++;
      if (cur && t.sid === cur) n += 5;
      return { t, n };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, cap || 8)
    .map(x => x.t);
}

/* Най-доброто ОПРЕДЕЛИТЕЛНО изречение за понятие */
function aiDefinitionFor(M, preferSid) {
  let best = null, bestScore = -1;
  const cur = aiCurrentSubject();
  aiTopicsForTerm(M, 8).forEach(t => {
    aiSentences(t).forEach(sent => {
      const low = sent.toLowerCase();
      if (!M.test(low)) return;
      const pos = low.search(new RegExp('(^|[^а-яa-zё])' + M.keys[0]));
      let sc = 0;
      // „Терминът е/са/— …“ в самото начало → истинска дефиниция
      if (new RegExp('^[«„"\\s]*' + M.keys[0] + '[а-яё]*(то|та)?\\s*(е|са|—|–|:|се нарича|представлява)', 'i').test(low)) sc += 5;
      else if (new RegExp('^[«„"\\s]*' + M.keys[0], 'i').test(low)) sc += 2;
      // дефиниционен глагол близо след термина
      if (pos >= 0 && pos < 60 && /(^|\s)(е|са|представлява|представляват|означава|се нарича|наричаме|е налице|бива)(\s|,)/.test(low)) sc += 1.5;
      if (preferSid && t.sid === preferSid) sc += 1;
      if (cur && t.sid === cur) sc += 1;
      sc -= Math.min(1.5, sent.length / 400);
      if (sc > bestScore) { bestScore = sc; best = { sent, t }; }
    });
  });
  // 1) безспорна дефиниция от конспекта („X е …“)
  if (best && bestScore >= 5) return best;
  // 2) дефиниционна флашкарта („Какво е X?“) — най-надеждният източник
  const cards = [aiFindCard(M.term, preferSid), aiFindCard(M.term, null)].filter(Boolean);
  const defCard = cards.find(c => /^какво|^каква|^що е|определение|понятие/.test(aiStrip(c.q).toLowerCase()));
  if (defCard) return { sent: aiStrip(defCard.a).slice(0, 320), t: null, card: defCard };
  // 3) прилично изречение
  if (best && bestScore >= 3.5) return best;
  // 4) каквато и да е карта по темата
  if (cards[0]) return { sent: aiStrip(cards[0].a).slice(0, 320), t: null, card: cards[0] };
  return null; // по-добре честно „няма“, отколкото случаен текст
}

/* ---------- Истинско сравнение: какво казва САМИЯТ материал ---------- */
function aiAnswerCompare(question) {
  const pair = aiParseCompare(question);
  if (!pair) return null;
  const A = aiTermMatcher(pair[0]);
  const B = aiTermMatcher(pair[1]);
  if (!A.ok || !B.ok) return null;
  const cur = aiCurrentSubject();

  /* 1) Изречения, които споменават ДВЕТЕ понятия — там е истинската съпоставка */
  let direct = [];
  aiFullIndex().forEach(t => {
    if (!aiInScope(t.sid)) return;
    if (!A.test(t.lower) || !B.test(t.lower)) return;
    aiSentences(t).forEach(sent => {
      const low = sent.toLowerCase();
      if (A.test(low) && B.test(low)) {
        let sc = 0;
        if (/разлика|различав|за разлика|докато|а не|обратно|противоположн|сравнени/.test(low)) sc += 3;
        if (cur && t.sid === cur) sc += 1;
        sc -= Math.min(1.5, sent.length / 400);
        direct.push({ sent, t, sc });
      }
    });
  });
  direct.sort((x, y) => y.sc - x.sc);
  // без почти-дубликати
  const seen = [];
  direct = direct.filter(d => {
    const k = d.sent.slice(0, 60);
    if (seen.includes(k)) return false;
    seen.push(k); return true;
  }).slice(0, 2);

  /* 2) Флашкарта, която сравнява двете (напр. „разликата X/Y“) */
  let bothCard = null;
  try {
    const D = window.PA_DATA || {};
    let bestSc = 0;
    Object.keys(D.flashcards || {}).forEach(id => {
      if (!aiInScope(id)) return;
      (D.flashcards[id] || []).forEach(c => {
        const low = (aiStrip(c.q) + ' ' + aiStrip(c.a)).toLowerCase();
        if (A.test(low) && B.test(low)) {
          let sc = 1;
          if (/разлика|различав/.test(aiStrip(c.q).toLowerCase())) sc += 3;
          if (cur && id === cur) sc += 1;
          if (sc > bestSc) { bestSc = sc; bothCard = { ...c, sid: id }; }
        }
      });
    });
  } catch (e) {}

  /* 3) Определения на всяко понятие поотделно */
  const defA = aiDefinitionFor(A, null);
  const preferSid = defA && defA.t ? defA.t.sid : (defA && defA.card ? defA.card.sid : null);
  const defB = aiDefinitionFor(B, preferSid);

  if (!direct.length && !bothCard && !defA && !defB) {
    // мек обхват (текущ курс) без резултат → опитай във всички курсове
    if (__aiScope && !__aiScope.strict) {
      const lbl = __aiScope.label;
      __aiScope = null;
      const retry = aiAnswerCompare(question);
      if (retry) return '<div class="ai-more">В „' + escapeHtml(lbl) + '“ не намерих съпоставка — ето какво откривам в останалите курсове:</div>' + retry;
    }
    // строг обхват (назован закон) → честен отговор, БЕЗ материал от други закони
    return 'В материалите' + (__aiScope ? ' по ' + escapeHtml(__aiScope.label) : '') + ' не откривам съдържание, което да съпоставя „' + escapeHtml(A.term) + '“ и „' + escapeHtml(B.term) + '“. Провери изписването или пробвай с други термини от конспекта.';
  }

  const HL = [A, B];
  let html = '<strong>Сравнение: ' + escapeHtml(A.term) + ' ⟷ ' + escapeHtml(B.term) + '</strong>';
  if (__aiScope) html += ' <span class="ai-tag">' + escapeHtml(__aiScope.label) + '</span>';

  /* Директната съпоставка от материала — най-ценната част, върви първа */
  if (bothCard || direct.length) {
    html += '<div class="ai-cmp-direct"><div class="ai-cmp-direct-h">📌 Материалът ги съпоставя така:</div>';
    if (bothCard) {
      html += '<div class="ai-cmp-quote">' + aiHighlight(escapeHtml(aiStrip(bothCard.a).slice(0, 460)), HL) + '</div>';
    }
    direct.forEach(d => {
      // не повтаряй съдържанието на картата
      if (bothCard && aiStrip(bothCard.a).slice(0, 80) === d.sent.slice(0, 80)) return;
      html += '<div class="ai-cmp-quote">' + aiHighlight(escapeHtml(d.sent.slice(0, 380)), HL) +
        ' <a class="ai-src" href="#/conspect/' + d.t.sid + '?chapter=' + d.t.ti + '">📖 ' + escapeHtml(d.t.heading.slice(0, 40)) + '</a></div>';
    });
    html += '</div>';
  }

  /* Определенията — само ако ИСТИНСКИ са намерени за термина */
  const cols = [{ M: A, def: defA }, { M: B, def: defB }];
  // не повтаряй съдържание, което вече е в директната съпоставка
  const bothA = bothCard ? aiStrip(bothCard.a).slice(0, 80) : null;
  cols.forEach(c => {
    if (c.def && bothA && String(c.def.sent).slice(0, 80) === bothA) c.def = null;
  });
  // двете колони с еднакъв текст → една обща (картата сама сравнява двете)
  if (cols[0].def && cols[1].def && cols[0].def.sent === cols[1].def.sent) cols[1].def = null;
  if (cols.some(c => c.def)) {
    html += '<div class="ai-cmp">';
    cols.forEach(c => {
      html += '<div class="ai-cmp-col"><div class="ai-cmp-h">' + escapeHtml(c.M.term) + '</div>';
      if (c.def) {
        html += aiHighlight(escapeHtml(String(c.def.sent).slice(0, 300)), [c.M]);
        if (c.def.t) {
          html += '<br><a class="ai-src" href="#/conspect/' + c.def.t.sid + '?chapter=' + c.def.t.ti + '">📖 ' + escapeHtml(c.def.t.heading.slice(0, 42)) + '</a>';
        }
      } else {
        html += '<em>не намерих определение за това понятие</em>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<div class="ai-more">Всичко по-горе е извадено от учебните материали — не е генерирано. За аналитично сравнение по критерии включи истинския AI (пуснат сървър).</div>';
  return html;
}

/* ---------- Обяснение на конкретен член („чл. 215 НК“) ---------- */
function aiAnswerArticle(question) {
  const arts = [...String(question).toLowerCase().matchAll(/чл\.?\s*(\d+[а-яa-z]?)/g)].map(m => m[1]);
  if (!arts.length) return null;
  let html = '';
  [...new Set(arts)].slice(0, 2).forEach(num => {
    const M = aiTermMatcher('чл. ' + num);
    const hits = [];
    aiTopicsForTerm(M, 4).forEach(t => {
      aiSentences(t).forEach(sent => {
        if (M.test(sent.toLowerCase())) hits.push({ sent, t });
      });
    });
    hits.sort((x, y) => x.sent.length - y.sent.length);
    html += '<div style="margin-top:6px;"><strong>чл. ' + escapeHtml(num) + '</strong>';
    if (__aiScope) html += ' <span class="ai-tag">' + escapeHtml(__aiScope.label) + '</span>';
    html += '</div>';
    if (hits.length) {
      hits.slice(0, 2).forEach(h => {
        html += '<div class="ai-cmp-quote">' + aiHighlight(escapeHtml(h.sent.slice(0, 380)), [M]) +
          ' <a class="ai-src" href="#/conspect/' + h.t.sid + '?chapter=' + h.t.ti + '">📖 ' + escapeHtml(h.t.heading.slice(0, 40)) + '</a></div>';
      });
    } else {
      html += '<div class="ai-more">Не намирам този член в материалите' + (__aiScope ? ' по ' + escapeHtml(__aiScope.label) : '') + '.</div>';
    }
  });
  return html || null;
}

/* ---------- Локален отговор на свободен въпрос ---------- */
function aiLocalAnswer(question) {
  const cmp = aiAnswerCompare(question);
  if (cmp) return cmp;

  const art = aiAnswerArticle(question);
  if (art) return art;

  const ex = aiAnswerExplain(question);
  if (ex) return ex;

  // нищо не пасна — предложи най-близките теми
  const near = aiMatchTopics(question.split(' ').filter(w => w.length > 2).join(' '), 3);
  let html = 'Не открих тема, която пасва точно на въпроса. Опитай с ключова дума от конспекта (напр. „давност“, „непозволено увреждане“).';
  if (near.length) {
    html += '<div class="ai-more">Може би имаше предвид: ' + near.map(t =>
      '<a href="#/conspect/' + t.sid + '?chapter=' + t.ti + '">' + escapeHtml(t.heading.slice(0, 60)) + '</a>'
    ).join(' · ') + '</div>';
  }
  return html;
}

/* ---------- Сървърен режим (истински AI) ---------- */
function aiServerContext(question) {
  let topics = [];
  const pair = aiParseCompare(question);
  if (pair) {
    // сравнение → по една тема за всяко от двете понятия (пълнотекстово, в обхвата)
    pair.forEach(term => {
      const M = aiTermMatcher(term);
      const t = (M.ok ? aiTopicsForTerm(M, 1)[0] : null) || aiMatchTopics(term, 1)[0];
      if (t && !topics.some(x => x.sid === t.sid && x.ti === t.ti)) topics.push(t);
    });
  }
  if (!topics.length) {
    // въпрос за конкретен член → пълнотекстово търсене
    const art = String(question).toLowerCase().match(/чл\.?\s*(\d+[а-яa-z]?)/);
    if (art) topics = aiTopicsForTerm(aiTermMatcher('чл. ' + art[1]), 2);
  }
  if (!topics.length) topics = aiMatchTopics(question, 2);
  let context = '';
  const cap = topics.length > 1 ? 3500 : 4000;
  topics.forEach(t => {
    const body = aiTopicText(t.sid, t.ti, cap);
    if (body) context += t.heading + '\n' + body + '\n\n';
  });
  return {
    context: context.slice(0, 9000),
    subject: topics[0] ? topics[0].sname : (aiCurrentSubject() ? aiSubjName(aiCurrentSubject()) : ''),
  };
}

function aiHistoryForServer() {
  const tmp = document.createElement('div');
  return aiChatLog().slice(-6).map(m => {
    tmp.innerHTML = m.h;
    return { role: m.r === 'u' ? 'user' : 'assistant', content: (tmp.textContent || '').slice(0, 800) };
  }).filter(m => m.content.trim());
}

async function aiServerAsk(question) {
  const { context, subject } = aiServerContext(question);
  const headers = { 'Content-Type': 'application/json' };
  if (getJwt()) headers['Authorization'] = 'Bearer ' + getJwt();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const resp = await fetch(PA_API_URL + '/api/ai/ask', {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ question, context, subject, history: aiHistoryForServer() }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(json.message || 'Грешка ' + resp.status);
      err.status = resp.status;
      throw err;
    }
    return json.data.answer;
  } finally { clearTimeout(timer); }
}

/* ---------- Главен вход ---------- */
window.aiSuggest = async function(text) {
  text = String(text || '').trim();
  const body = $('#aiBody');
  if (!body || !text || window.__aiBusy) return;
  window.__aiBusy = true;
  const sendBtn = $('#aiSend');
  if (sendBtn) sendBtn.disabled = true;

  // Обхват на търсене: закон от въпроса („в НК“) или отвореният курс
  __aiScope = aiDetectScope(text);

  aiPushRaw('u', escapeHtml(text));

  // Интерактивните умения (тест, устен изпит, слаби места, казус) са локални
  const interactive = aiTryInteractive(text);
  if (interactive !== null) {
    if (interactive) {
      const div = aiPushRaw('a', interactive);
      await aiTypeInto(div, interactive);
    }
    __aiScope = null;
    window.__aiBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    const inp = $('#aiInput');
    if (inp) inp.focus();
    return;
  }

  const typing = aiTypingIndicator();

  let answer = null, viaServer = false;
  try {
    if (await backendReady()) {
      answer = await aiServerAsk(text);
      viaServer = true;
    }
  } catch (err) {
    if (err && err.status === 429) {
      // дневен лимит → покажи съобщението и мини на локален режим
      aiPushRaw('a', escapeHtml(err.message), { ephemeral: true });
    }
    answer = null; // пада към локалния двигател
  }

  try {
    if (typing) typing.remove();
    if (viaServer && answer) {
      const div = aiPushRaw('a', aiFormat(answer));
      await aiTypeInto(div, aiFormat(answer));
    } else {
      const html = aiLocalAnswer(text);
      if (html) {
        const div = aiPushRaw('a', html);
        await aiTypeInto(div, html);
      }
    }
  } catch (e) {
    if (typing) typing.remove();
    aiPushRaw('a', 'Нещо се обърка — опитай пак.', { ephemeral: true });
  }

  __aiScope = null;
  window.__aiBusy = false;
  if (sendBtn) sendBtn.disabled = false;
  const input = $('#aiInput');
  if (input) input.focus();
};

/* ---------- Първоначален изглед + предложения според страницата ---------- */
function aiWelcomeHTML() {
  return 'Здравей! Аз съм учебният асистент на Law+. Мога да <strong>обяснявам теми</strong> от конспектите, да те <strong>изпитвам с мини-тестове</strong> направо тук, да <strong>симулирам устен изпит</strong> и да <strong>анализирам грешките ти</strong>.';
}

function aiContextSuggestions() {
  const out = [];
  const cur = aiCurrentSubject();
  if (cur) {
    const chM = location.hash.match(/[?&]chapter=(\d+)/);
    const chapters = (window.PA_DATA.chapters || {})[cur] || [];
    const ti = chM ? parseInt(chM[1]) : null;
    if (ti !== null && chapters[ti]) out.push('Обясни ми „' + String(chapters[ti]).slice(0, 50) + '“');
    out.push('Изпитай ме с тест по ' + aiSubjName(cur).slice(0, 30));
  }
  out.push('Симулирай устен изпит');
  out.push('Кои са слабите ми места?');
  out.push('Дай ми казус за упражнение');
  return out.slice(0, 5);
}

function aiRenderSuggestions() {
  const body = $('#aiBody');
  if (!body) return;
  const wrap = document.createElement('div');
  wrap.className = 'ai-suggestions';
  wrap.innerHTML = aiContextSuggestions().map(s =>
    '<button class="ai-suggest">' + escapeHtml(s) + '</button>').join('');
  wrap.querySelectorAll('.ai-suggest').forEach(btn => {
    btn.onclick = () => { window.aiSuggest(btn.textContent); };
  });
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}

function aiRestoreChat() {
  const body = $('#aiBody');
  if (!body) return;
  body.innerHTML = '';
  const log = aiChatLog();
  if (!log.length) {
    aiPushRaw('a', aiWelcomeHTML(), { ephemeral: true });
    aiRenderSuggestions();
  } else {
    log.forEach(m => {
      const div = document.createElement('div');
      div.className = 'ai-msg' + (m.r === 'u' ? ' user' : '');
      div.innerHTML = m.h;
      body.appendChild(div);
    });
    body.scrollTop = body.scrollHeight;
  }
}

async function aiUpdateStatus() {
  const el = $('#aiStatus');
  if (!el) return;
  el.textContent = '● проверявам връзката…';
  let online = false;
  try { online = await backendReady(); } catch (e) {}
  el.textContent = online ? '● истински AI · онлайн' : '● демо режим';
  const bar = $('#aiDemoBar');
  if (bar) bar.style.display = online ? 'none' : 'block';
}

function setupAIBubble() {
  const bubble = $('#aiBubble');
  const panel = $('#aiPanel');
  const close = $('#aiClose');
  const reset = $('#aiReset');
  const send = $('#aiSend');
  const input = $('#aiInput');
  if (bubble && panel) bubble.onclick = () => {
    const opening = !panel.classList.contains('open');
    panel.classList.toggle('open');
    if (opening) {
      aiRestoreChat();
      aiUpdateStatus();
      if (input) setTimeout(() => input.focus(), 250);
    }
  };
  if (close) close.onclick = () => panel.classList.remove('open');
  if (reset) reset.onclick = () => {
    state.aiChat = [];
    saveState();
    window.__aiQuiz = null; window.__aiOral = null;
    aiRestoreChat();
  };
  const submit = () => {
    if (!input || !input.value.trim()) return;
    const v = input.value;
    input.value = '';
    window.aiSuggest(v);
  };
  if (send && input) send.onclick = submit;
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && panel.classList.contains('open')) panel.classList.remove('open');
  });
}

function emptyDashboard() {
  return `
    <div style="background:var(--paper);border:0.5px dashed var(--border-2);border-radius:var(--radius-l);padding:60px;text-align:center;">
      <div class="serif" style="font-size:24px;color:var(--navy);margin-bottom:8px;">Започни своята подготовка</div>
      <p style="color:var(--text-2);margin-bottom:8px;max-width:480px;margin-left:auto;margin-right:auto;">Все още не си купил пакет — но не е нужно да купуваш на сляпо:</p>
      <p style="color:var(--gold-3);font-weight:600;margin-bottom:24px;">🎁 Всяка дисциплина има 5 безплатни карти за проба.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <a href="#/packages" class="btn btn-gold btn-lg">🎁 Пробвай безплатно →</a>
        <a href="#/packages" class="btn btn-outline btn-lg">Разгледай пакетите</a>
      </div>
    </div>
  `;
}

function subjectCard(s) {
  // ПОПРАВКА: показваме САМО истинския прогрес (преди имаше random демо стойност)
  const pct = progressOf(s.id) || 0;
  const p = state.progress[s.id] || { topics: 0, cards: 0 };
  return `
    <div class="subj-card" onclick="location.hash='#/subject/${s.id}'">
      <div class="subj-card-head">
        <span class="pkg-meta">${s.topics} теми</span>
        ${iconSvg('arrow')}
      </div>
      <div class="subj-name" style="margin-bottom:14px;">${escapeHtml(s.name)}</div>
      <div class="subj-progress-row">
        <div class="subj-ring">${ringSvg(pct, 56)}</div>
        <div class="subj-stats">
          <div><strong>${p.topics}</strong> / ${s.topics} теми</div>
          <div><strong>${p.cards}</strong> / ${s.cards} карти</div>
          <div>${pct >= 80 ? '🎯 Близо до целта' : pct >= 50 ? 'В процес' : 'Започната'}</div>
        </div>
      </div>
    </div>
  `;
}

function quickTool(label, sub, icon, href) {
  return `
    <a href="${href}" class="tool">
      ${iconSvg(icon)}
      <div class="tool-lbl">${label}</div>
      <div class="tool-sub">${sub}</div>
    </a>
  `;
}

export { AI_LAWS, AI_STOP, PA_API_URL, __aiFull, __aiIdx, __aiScope, aiAnswerArticle, aiAnswerCase, aiAnswerCompare, aiAnswerExplain, aiAnswerWeakSpots, aiBubbleHTML, aiCaseHtml, aiChatLog, aiContextSuggestions, aiCurrentSubject, aiDefinitionFor, aiDetectScope, aiFindCard, aiFindCase, aiFormat, aiFullIndex, aiHighlight, aiHistoryForServer, aiInScope, aiIndex, aiLocalAnswer, aiMatchSubject, aiMatchTopics, aiMatcherKey, aiOralNext, aiParseCompare, aiPushRaw, aiQuizNext, aiRandomCase, aiRenderSuggestions, aiRestoreChat, aiSentences, aiServerAsk, aiServerContext, aiStem, aiStrip, aiSubjName, aiTermMatcher, aiTok, aiTopicText, aiTopicsForTerm, aiTryInteractive, aiTypeInto, aiTypingIndicator, aiUpdateStatus, aiWelcomeHTML, emptyDashboard, quickTool, setupAIBubble, subjectCard };
