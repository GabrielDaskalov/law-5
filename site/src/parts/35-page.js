/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getFlashcards } from './01-seed.js';
import { saveState } from './09-backend-integraciya.js';
import { $, $$, el, escapeHtml, isLoggedIn, ownsSubject } from './10-helpers.js';
import { iconSvg } from './27-page.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Flashcards
   ============================================================================= */
const FREE_CARDS_LIMIT = 5; // безплатни карти за не-купени дисциплини

function renderFlashcards(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();

  // FREE TIER: не-купена дисциплина → първите 5 карти безплатно + CTA
  const freeMode = !ownsSubject(id);

  let allCards = getFlashcards(id) || [];
  const totalCards = allCards.length;
  if (freeMode) {
    if (!totalCards) { location.hash = '#/subject/' + id; return; }
    allCards = allCards.slice(0, FREE_CARDS_LIMIT);
  }
  const chapters = s.chapters || [];
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const topicParam = params.get('topic'); // null = picker | 'all' | '<index>'

  // group cards by specific question (topicIdx), with fallbacks
  const byTopic = {};
  allCards.forEach(c => {
    let ti = (typeof c.topicIdx === 'number') ? c.topicIdx
           : (c.topic != null ? chapters.indexOf(c.topic) : -1);
    if (!(ti >= 0)) ti = 0;
    (byTopic[ti] = byTopic[ti] || []).push(c);
  });

  if (!state.fcDeck) state.fcDeck = {};
  if (!state.fcMastered) state.fcMastered = {};
  const dkey = tk => id + ':' + tk;
  function recomputeMastered() {
    let sum = 0;
    Object.keys(state.fcDeck).forEach(k => {
      if (k === id + ':all') return; // avoid double counting the combined deck
      if (k === id || k.indexOf(id + ':') === 0) sum += (state.fcDeck[k].known || 0);
    });
    state.fcMastered[id] = Math.min(sum, allCards.length);
  }

  // FREE TIER: без избор на теми — направо 5-те безплатни карти + банер.
  // location.replace (не location.hash=) — иначе „назад" връща на този
  // адрес, той пак пренасочва напред и навигацията се закльощва в цикъл.
  if (freeMode && topicParam === null) {
    location.replace(location.href.split('#')[0] + '#/flashcards/' + id + '?topic=all');
    return;
  }

  /* ---------------- TOPIC PICKER (избор на въпрос) ---------------- */
  if (topicParam === null) {
    const entries = chapters.map((title, i) => ({ i, title, n: (byTopic[i] || []).length }))
                            .filter(t => t.n > 0);
    const rows = entries.map(t => {
      const deck = state.fcDeck[dkey(String(t.i))];
      const done = deck && deck.idx >= t.n;
      return `
        <button class="fc-tcard" data-title="${escapeHtml(t.title.toLowerCase())}" onclick="location.hash='#/flashcards/${id}?topic=${t.i}'">
          <span class="num">${String(t.i + 1).padStart(2, '0')}</span>
          <span class="title">${escapeHtml(t.title)}</span>
          <span class="meta">
            ${done ? '<span class="badge-done">✓ научена</span>' : ''}
            <span class="count">${t.n} ${t.n === 1 ? 'карта' : 'карти'}</span>
            <span class="arr">→</span>
          </span>
        </button>`;
    }).join('');

    $('#app').innerHTML = `
      <div class="fc-page">
        <div class="fc-head"><div class="container fc-head-row">
          <a href="#/subject/${id}" class="fc-back">← ${escapeHtml(s.name)}</a>
          <span class="fc-counter">${allCards.length} карти · ${entries.length} въпроса</span>
        </div></div>
        <div class="fc-index">
          <div class="fc-index-intro">
            <div>
              <h2>Флашкарти · ${escapeHtml(s.name)}</h2>
              <p>Избери конкретен въпрос от конспекта или учи всички карти подред.</p>
            </div>
          </div>
          <button class="fc-allcard" onclick="location.hash='#/flashcards/${id}?topic=all'">
            <span class="ic">${iconSvg('cards')}</span>
            <span>
              <span class="t">Учи всички въпроси</span>
              <span class="sub">${allCards.length} карти от всички ${entries.length} теми, една след друга</span>
            </span>
            <span class="arr">→</span>
          </button>
          <input class="fc-search" id="fcSearch" type="text" placeholder="Търси въпрос по ключова дума..." oninput="window.__fcFilter()" autocomplete="off" />
          <div class="fc-topic-list" id="fcTopicList">${rows}</div>
          <div class="fc-noresult" id="fcNoResult" style="display:none;">Няма въпрос, който да отговаря на търсенето.</div>
        </div>
      </div>`;

    window.__fcFilter = function () {
      const inp = $('#fcSearch');
      const q = ((inp && inp.value) || '').trim().toLowerCase();
      let shown = 0;
      $$('#fcTopicList .fc-tcard').forEach(el => {
        const match = !q || (el.getAttribute('data-title') || '').indexOf(q) !== -1;
        el.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      const nr = $('#fcNoResult'); if (nr) nr.style.display = shown === 0 ? 'block' : 'none';
    };
    return;
  }

  /* ---------------- STUDY MODE ---------------- */
  let cards, label, tkey;
  if (topicParam === 'all') {
    cards = allCards; label = 'Всички въпроси'; tkey = 'all';
  } else {
    const ti = parseInt(topicParam, 10);
    cards = byTopic[ti] || [];
    label = chapters[ti] || ('Тема ' + (ti + 1));
    tkey = String(ti);
  }
  if (!cards.length) { location.hash = '#/flashcards/' + id; return; }

  const deckKey = dkey(tkey);
  if (!state.fcDeck[deckKey]) state.fcDeck[deckKey] = { idx: 0, known: 0, unknown: 0 };
  const deck = state.fcDeck[deckKey];
  if (deck.idx > cards.length) deck.idx = cards.length;
  // Безплатна проба: „назад" води към дисциплината, не към избора на теми
  // (той не съществува за некупени пакети и би зациклил пренасочването)
  const backHref = freeMode ? '#/subject/' + id : '#/flashcards/' + id;

  // FREE TIER: банер, който показва колко карти остават заключени
  const freeBanner = freeMode ? `
    <div style="background:var(--gold-bg);border:1px solid var(--gold);border-radius:10px;padding:12px 18px;margin:0 auto 16px;max-width:640px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;color:var(--text-1);">🎁 Пробваш <strong>${FREE_CARDS_LIMIT} безплатни карти</strong> от общо <strong>${totalCards}</strong>.</span>
      <button class="btn btn-gold btn-sm" onclick="purchaseSubject('${id}')">Отключи всички →</button>
    </div>` : '';

  function renderCard() {
    if (deck.idx >= cards.length) {
      recomputeMastered(); saveState();
      if (freeMode) {
        $('#app').innerHTML = `
          <div class="fc-page">
            <div class="fc-head"><div class="container fc-head-row">
              <a href="#/subject/${id}" class="fc-back">← Към дисциплината</a>
              <span class="fc-counter">Безплатната проба завърши</span>
            </div></div>
            <div class="fc-summary">
              <h3>Хареса ли ти? 🎓</h3>
              <p>Пробва ${cards.length} от общо <strong>${totalCards} карти</strong> по „${escapeHtml(s.name)}".</p>
              <div class="fc-summary-stats">
                <div class="fc-summary-stat"><div class="num green">${deck.known}</div><div class="lbl">Знам</div></div>
                <div class="fc-summary-stat"><div class="num red">${deck.unknown}</div><div class="lbl">Не знам</div></div>
              </div>
              <p style="font-size:13px;color:var(--text-2);margin:10px 0 18px;">Пълният пакет включва всичките ${totalCards} карти, конспект, тестове и казуси — lifetime достъп.</p>
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                <button class="btn btn-gold btn-lg" onclick="purchaseSubject('${id}')">Отключи пълния пакет — 35 € →</button>
                <a href="#/packages" class="btn btn-outline">Виж всички пакети</a>
              </div>
            </div>
          </div>`;
        return;
      }
      $('#app').innerHTML = `
        <div class="fc-page">
          <div class="fc-head"><div class="container fc-head-row">
            <a href="${backHref}" class="fc-back">← Към въпросите</a>
            <span class="fc-counter">Сесия завършена</span>
          </div></div>
          <div class="fc-summary">
            <h3>Браво!</h3>
            <p>Завърши ${cards.length} карти · „${escapeHtml(label)}“</p>
            <div class="fc-summary-stats">
              <div class="fc-summary-stat"><div class="num green">${deck.known}</div><div class="lbl">Знам</div></div>
              <div class="fc-summary-stat"><div class="num red">${deck.unknown}</div><div class="lbl">Не знам</div></div>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              <button class="btn btn-outline" onclick="window.__fcRestart('${tkey}')">Започни отново</button>
              <a href="${backHref}" class="btn btn-gold">Други въпроси</a>
            </div>
          </div>
        </div>`;
      return;
    }

    const card = cards[deck.idx];
    const progress = (deck.idx / cards.length) * 100;

    $('#app').innerHTML = `
      <div class="fc-page">
        <div class="fc-head"><div class="container">
          <div class="fc-head-row">
            <a href="${backHref}" class="fc-back">← ${freeMode ? 'Към дисциплината' : 'Към въпросите'}</a>
            <span class="fc-counter">Карта <strong>${deck.idx + 1}</strong> / ${cards.length}</span>
          </div>
          <div class="fc-progress"><div class="fc-progress-fill" style="width:${progress}%;"></div></div>
          <div class="fc-topic">${escapeHtml(s.name)} · ${escapeHtml(label)}</div>
        </div></div>
        <div class="fc-stage">
          ${freeBanner}
          <div class="fc-card-wrap">
            <div class="fc-card" id="fcCard" onclick="this.classList.toggle('flipped')">
              <div class="fc-face fc-face-front">
                <div class="fc-side-tag">Въпрос · лицева страна</div>
                <div class="fc-q">${escapeHtml(card.q)}</div>
                <div class="fc-tap-hint">Натисни картата, за да видиш отговора</div>
              </div>
              <div class="fc-face fc-face-back">
                <div class="fc-side-tag" style="text-align:center;">Отговор · обратна страна</div>
                <div class="fc-a">${escapeHtml(card.a)}</div>
              </div>
            </div>
          </div>
          <div class="fc-actions">
            <button class="btn btn-outline" onclick="window.__fcAnswer(false)">✕ Не знам</button>
            <button class="btn btn-gold" onclick="window.__fcAnswer(true)">✓ Знам</button>
          </div>
          <div class="fc-kbd-hint" style="text-align:center;margin-top:10px;font-size:11px;color:var(--text-3);">
            ⌨ Space = обърни · → = знам · ← = не знам
          </div>
        </div>
      </div>`;
  }

  renderCard();

  window.__fcAnswer = function (known) {
    if (known) deck.known++; else deck.unknown++;
    deck.idx++;
    const cardEl = $('#fcCard');
    if (cardEl && !known) cardEl.classList.add('shake');
    if (cardEl && known) cardEl.classList.add('pulse-gold');
    recomputeMastered();
    saveState();
    setTimeout(renderCard, 350);
  };
  window.__fcRestart = function (tk) {
    state.fcDeck[id + ':' + tk] = { idx: 0, known: 0, unknown: 0 };
    saveState();
    renderFlashcards(id);
  };
}

export { FREE_CARDS_LIMIT, renderFlashcards };
