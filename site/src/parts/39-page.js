/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getQuiz } from './05-case-studies.js';
import { recordMistake } from './08-tetradka-na-greshkite.js';
import { $, $$, bukvaOpcia, el, escapeHtml, isLoggedIn, ownsSubject } from './10-helpers.js';
import { render404 } from './56-404.js';

import { checkAnswer, loadQuizForTopics } from '../lib/content.js';

/* =============================================================================
   PAGES — Quiz
   ============================================================================= */
function renderQuiz(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  let selectedTopics = []; // chapter indices, empty = all
  let questions = [];
  let qIdx = 0;
  let answers = [];
  let quizDirection = 'both'; // for Latin: 'both' | 'lat2bg' | 'bg2lat'

  function renderTopicSelect() {
    $('#app').innerHTML = `
      <section class="page-head">
        <div class="container">
          <a href="#/subject/${id}" style="font-size:13px;color:var(--text-3);">← ${s.name}</a>
          <span class="eyebrow" style="margin-top:14px;">Тестове</span>
          <h1 style="margin-top:10px;">Избери теми за теста</h1>
          <p>Избери една или повече теми, или остави празно за смесен тест върху целия материал.</p>
        </div>
      </section>
      <section style="padding-bottom:80px;">
        <div class="container" style="max-width:760px;">
          <div class="card card-raised" style="padding:28px;">
            <h3 style="font-size:16px;margin-bottom:14px;">Теми</h3>
            <input class="input" id="quizTopicSearch" type="text" placeholder="Търси тема по ключова дума…"
              style="margin-bottom:12px;"
              oninput="(function(q){ document.querySelectorAll('#chipRow .chip[data-idx]').forEach(c => { c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; }); })(this.value.toLowerCase())">
            <div class="chip-row" id="chipRow">
              <span class="chip ${selectedTopics.length === 0 ? 'active' : ''}" data-all="1">Всички теми</span>
              ${s.chapters.map((ch, i) => `
                <span class="chip ${selectedTopics.includes(i) ? 'active' : ''}" data-idx="${i}">${i + 1}. ${ch}</span>
              `).join('')}
            </div>

            <h3 style="font-size:16px;margin:20px 0 14px;">Брой въпроси</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${[5, 10, 15, 20].map((n, i) => `
                <span class="chip ${i === 1 ? 'active' : ''}" data-count="${n}">${n} въпроса</span>
              `).join('')}
            </div>

            ${id === 'lat' ? `
              <h3 style="font-size:16px;margin:20px 0 14px;">Посока на превод</h3>
              <div style="display:flex;gap:8px;flex-wrap:wrap;" id="dirRow">
                <span class="chip active" data-dir="both">И двете посоки</span>
                <span class="chip" data-dir="lat2bg">Латински → Български</span>
                <span class="chip" data-dir="bg2lat">Български → Латински</span>
              </div>
            ` : ''}

            <div style="margin-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
              <div style="font-size:13px;color:var(--text-2);" id="quizSummary">Смесен тест · 10 въпроса</div>
              <button class="btn btn-gold btn-lg" id="startQuiz">Започни тест →</button>
            </div>
          </div>
        </div>
      </section>
    `;

    let count = 10;

    $$('#chipRow .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (chip.dataset.all) {
          selectedTopics = [];
          $$('#chipRow .chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        } else {
          chip.classList.toggle('active');
          $('#chipRow .chip[data-all]').classList.remove('active');
          const idx = parseInt(chip.dataset.idx);
          if (chip.classList.contains('active')) selectedTopics.push(idx);
          else selectedTopics = selectedTopics.filter(x => x !== idx);
          if (selectedTopics.length === 0) $('#chipRow .chip[data-all]').classList.add('active');
        }
        updateSummary();
      });
    });

    $$('.chip[data-count]').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('.chip[data-count]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        count = parseInt(chip.dataset.count);
        updateSummary();
      });
    });

    $$('#dirRow .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#dirRow .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        quizDirection = chip.dataset.dir;
      });
    });

    function updateSummary() {
      const topicLabel = selectedTopics.length === 0 ? 'смесен тест' : selectedTopics.length + (selectedTopics.length === 1 ? ' избрана тема' : ' избрани теми');
      $('#quizSummary').textContent = topicLabel + ' · ' + count + ' въпроса';
    }

    $('#startQuiz').addEventListener('click', async () => {
      /* При избрани теми въпросите им се теглят поименно от сървъра —
         иначе за по-задна тема може да няма нищо в общия списък и тестът
         да излезе празен. */
      const startBtn = $('#startQuiz');
      if (selectedTopics.length > 0) {
        startBtn.disabled = true;
        const label = startBtn.textContent;
        startBtn.textContent = 'Подготвя теста…';
        try {
          await loadQuizForTopics(id, selectedTopics);
        } catch (err) {
          toast('⚠ Въпросите не се заредиха. Опитай пак.');
        }
        startBtn.disabled = false;
        startBtn.textContent = label;
      }

      // Build question pool
      const all = getQuiz(id);
      let pool = all;
      if (selectedTopics.length > 0) {
        // Filter by topicIdx (preferred) or by index modulo (fallback)
        pool = all.filter((q, i) => {
          const ti = (typeof q.topicIdx === 'number') ? q.topicIdx : (i % s.chapters.length);
          return selectedTopics.includes(ti);
        });
      }
      // Latin: filter by direction
      if (id === 'lat' && quizDirection !== 'both') {
        pool = pool.filter(q => q.direction === quizDirection);
      }
      // Shuffle for variety between attempts, then take the requested count
      pool = pool.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      questions = pool.slice(0, count);
      if (questions.length === 0) questions = all.slice(0, count);
      qIdx = 0;
      answers = [];
      renderQ();
    });
  }

  function renderQ() {
    if (qIdx >= questions.length) {
      // Summary
      const correct = answers.filter(a => a.correct).length;
      const score = Math.round((correct / questions.length) * 100);
      const wrong = answers.map((a, i) => ({ ...a, q: questions[i] })).filter(x => !x.correct);

      const wrongListHtml = wrong.length ? `
        <div style="margin-top:32px;text-align:left;">
          <h3 style="font-size:18px;color:var(--navy);margin:0 0 14px;">Грешки за преговор <span style="color:var(--red);">(${wrong.length})</span></h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${wrong.map((w, i) => {
              const q = w.q;
              const isFill = q.type === 'fill';
              const correctAns = isFill ? (q.answer || (q.accept && q.accept[0]) || '') : (q.options ? q.options[q.correct] : '');
              const userAns = w.userAnswer || '(без отговор)';
              return `
                <div style="background:var(--off-white);border-left:3px solid var(--red);border-radius:8px;padding:14px 16px;">
                  <div style="font-size:13px;color:var(--text-3);margin-bottom:6px;">Въпрос ${i + 1}${q.direction ? ' · ' + (q.direction === 'lat2bg' ? 'Лат→Бг' : 'Бг→Лат') : ''}</div>
                  <div style="font-size:14px;color:var(--text-1);margin-bottom:10px;">${escapeHtml(q.q)}</div>
                  ${isFill ? `<div style="font-size:13px;color:var(--red);margin-bottom:4px;">✗ Твоят отговор: <strong>${escapeHtml(userAns)}</strong></div>` : ''}
                  <div style="font-size:13px;color:var(--green);"><strong>✓ Правилен отговор:</strong> ${escapeHtml(correctAns)}</div>
                  ${q.explain && !isFill ? `<div style="font-size:12px;color:var(--text-2);margin-top:6px;">${escapeHtml(q.explain)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : `
        <div style="margin-top:24px;padding:20px;background:rgba(34,139,72,0.06);border-radius:12px;border:1px solid var(--green);">
          <div style="font-size:15px;color:var(--green);font-weight:500;">🎉 Всички отговори са верни!</div>
        </div>
      `;

      $('#app').innerHTML = `
        <section style="padding:48px 0;">
          <div class="container" style="max-width:760px;">
            <div class="quiz-card" style="text-align:center;">
              <span class="eyebrow">Тест приключен</span>
              <h2 style="margin-top:14px;font-size:28px;">${score >= 75 ? 'Отлично!' : score >= 50 ? 'Добра работа.' : 'Има върху какво да поработим.'}</h2>
              <p style="color:var(--text-2);margin-top:8px;">Резултат: <strong style="color:var(--navy);">${correct} / ${questions.length}</strong> верни отговора</p>
              <svg viewBox="0 0 120 120" width="120" height="120" style="display:block;margin:24px auto;">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--neutral-bg)" stroke-width="8"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="${score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--red)'}" stroke-width="8" stroke-linecap="round"
                        stroke-dasharray="326.7" stroke-dashoffset="${326.7 - (score/100) * 326.7}"
                        transform="rotate(-90 60 60)"/>
                <text x="60" y="68" text-anchor="middle" font-family="Playfair Display" font-size="28" fill="var(--navy)" font-weight="500">${score}%</text>
              </svg>
              ${wrongListHtml}
              <div style="display:flex;gap:10px;justify-content:center;margin-top:24px;">
                <a href="#/subject/${id}" class="btn btn-outline">Към дисциплината</a>
                <button class="btn btn-gold" onclick="renderQuiz('${id}')">Започни нов тест</button>
              </div>
            </div>
          </div>
        </section>
      `;
      return;
    }

    const q = questions[qIdx];
    const progress = ((qIdx) / questions.length) * 100;
    const isFill = q.type === 'fill';

    $('#app').innerHTML = `
      <section style="padding:48px 0;">
        <div class="container">
          <a href="#/subject/${id}" style="font-size:13px;color:var(--text-3);">← ${s.name}</a>
          <div class="quiz-card" style="margin-top:16px;">
            <div class="quiz-progress">
              <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${progress}%;"></div></div>
              <div class="quiz-progress-num">${qIdx + 1} / ${questions.length}</div>
            </div>
            ${isFill && q.direction ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--gold);font-weight:600;margin-bottom:8px;">${q.direction === 'lat2bg' ? 'Латински → Български' : 'Български → Латински'}</div>` : ''}
            <div class="quiz-q">${escapeHtml(q.q)}</div>
            ${isFill ? `
              <div class="quiz-fill" id="qFill" style="margin-top:24px;">
                <input type="text" class="input" id="fillInput" placeholder="Напиши превода тук..." autocomplete="off" autocorrect="off" spellcheck="false" style="width:100%;font-size:16px;padding:14px 16px;border:2px solid var(--border);border-radius:10px;">
              </div>
            ` : `
              <div class="quiz-options" id="qOptions">
                ${q.options.map((opt, i) => `
                  <button class="quiz-option" data-idx="${i}">
                    <div class="quiz-letter">${bukvaOpcia(i)}</div>
                    <div>${escapeHtml(opt)}</div>
                  </button>
                `).join('')}
              </div>
            `}
            <div class="quiz-actions">
              <span style="font-size:12px;color:var(--text-3);">${isFill ? 'Натисни Enter или бутона за проверка' : 'Избери един отговор'}</span>
              ${isFill ? `<button class="btn btn-gold btn-sm" id="fillCheck">Провери →</button>` : `<button class="btn btn-outline btn-sm" onclick="qIdx=questions.length;renderQ();" style="display:none;" id="qSkip">Прескочи теста</button>`}
            </div>
          </div>
        </div>
      </section>
    `;

    if (isFill) {
      const input = $('#fillInput');
      const checkBtn = $('#fillCheck');
      input.focus();

      const submit = async () => {
        if (input.disabled) return;
        const userRaw = input.value.trim();
        const user = normalizeAnswer(input.value);
        if (!user) { input.focus(); return; }

        /* Приетите варианти също стоят на сървъра — в браузъра ги няма. */
        input.disabled = true;
        checkBtn.disabled = true;
        let verdict;
        try {
          verdict = await checkAnswer(q, { text: userRaw });
        } catch (err) {
          input.disabled = false;
          checkBtn.disabled = false;
          toast('⚠ Проверката не мина. Провери връзката и опитай пак.');
          return;
        }
        const isCorrect = verdict.correct;
        answers.push({ correct: isCorrect, userAnswer: userRaw });
        input.style.borderColor = isCorrect ? 'var(--green)' : 'var(--red)';
        input.style.background = isCorrect ? 'rgba(34,139,72,0.06)' : 'rgba(200,58,58,0.06)';

        const explainEl = el(`<div class="quiz-explain">
          <strong>${isCorrect ? '✓ Верен отговор.' : '✗ Грешен отговор.'}</strong>
          ${!isCorrect ? `<div style="margin-top:6px;">Правилен отговор: <strong>${escapeHtml(verdict.correctAnswer || '')}</strong></div>` : ''}
          ${verdict.explanation ? `<div style="margin-top:6px;font-size:13px;color:var(--text-2);">${escapeHtml(verdict.explanation)}</div>` : ''}
        </div>`);
        $('.quiz-fill').after(explainEl);

        $('.quiz-actions').innerHTML = `
          <span style="font-size:12px;color:${isCorrect ? 'var(--green)' : 'var(--red)'};font-weight:500;">${isCorrect ? '+1 точка' : '0 точки'}</span>
          <button class="btn btn-gold" id="nextQ">Следващ въпрос →</button>
        `;
        const nextBtn = $('#nextQ');
        nextBtn.addEventListener('click', () => { qIdx++; renderQ(); });
        nextBtn.focus();
      };

      checkBtn.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
      // Enter on the whole page after check → next
      document.addEventListener('keydown', function nextOnEnter(e) {
        if (e.key === 'Enter' && input.disabled) {
          const nb = $('#nextQ');
          if (nb) { e.preventDefault(); nb.click(); document.removeEventListener('keydown', nextOnEnter); }
        }
      });
      return;
    }

    $$('#qOptions .quiz-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('answered')) return;
        const idx = parseInt(btn.dataset.idx);

        /* ПРОМЯНА СПРЯМО СТАРИЯ САЙТ.
           Досега верният отговор пътуваше заедно с въпроса и сравнението
           беше тук, в браузъра — тоест отговорът се четеше от конзолата,
           преди студентът да е отговорил. Сега въпросът идва без отговор и
           отсъжда сървърът. */
        $$('#qOptions .quiz-option').forEach(b => { b.style.pointerEvents = 'none'; });
        btn.classList.add('checking');

        let verdict;
        try {
          verdict = await checkAnswer(q, { index: idx });
        } catch (err) {
          btn.classList.remove('checking');
          $$('#qOptions .quiz-option').forEach(b => { b.style.pointerEvents = ''; });
          toast('⚠ Проверката не мина. Провери връзката и опитай пак.');
          return;
        }
        btn.classList.remove('checking');

        const isCorrect = verdict.correct;
        answers.push({ correct: isCorrect, userAnswer: q.options[idx] });

        // Тетрадка на грешките: сбърканото се записва автоматично
        if (!isCorrect) recordMistake(id, q);

        $$('#qOptions .quiz-option').forEach((b, i) => {
          b.classList.add('answered');
          if (i === verdict.correctIndex) b.classList.add('correct');
          else if (i === idx && !isCorrect) b.classList.add('wrong');
          b.style.pointerEvents = 'none';
        });

        /* Разбор след отговора.
           При грешка студентът трябва да получи три неща наведнъж: защо
           неговият избор е грешен, кой е верният отговор и защо той е верен.
           Само „грешен отговор" не учи на нищо — а точно на грешките се учи
           най-много. */
        const zashto = verdict.optionExplanations || {};
        const veren = Number.isInteger(verdict.correctIndex) ? verdict.correctIndex : -1;
        const tekstVeren = veren >= 0 ? (q.options[veren] || '') : '';

        let razbor = '';
        if (isCorrect) {
          razbor =
            `<div class="qr-glava qr-verno">✓ Верен отговор</div>` +
            `<div class="qr-red"><div class="qr-etiket">Защо е верен</div>` +
            `<div>${escapeHtml(verdict.explanation || '')}</div></div>`;
        } else {
          const moiat = zashto[String(idx)];
          razbor =
            `<div class="qr-glava qr-greshno">✗ Грешен отговор</div>` +
            `<div class="qr-red"><div class="qr-etiket">Твоят отговор</div>` +
            `<div><span class="qr-bukva qr-b-greshna">${bukvaOpcia(idx)}</span>` +
            `${escapeHtml(q.options[idx] || '')}</div></div>` +
            (moiat
              ? `<div class="qr-red"><div class="qr-etiket">Защо е грешен</div>` +
                `<div>${escapeHtml(moiat)}</div></div>`
              : '') +
            (veren >= 0
              ? `<div class="qr-red"><div class="qr-etiket">Верният е</div>` +
                `<div><span class="qr-bukva qr-b-verna">${bukvaOpcia(veren)}</span>` +
                `${escapeHtml(tekstVeren)}</div></div>`
              : '') +
            `<div class="qr-red"><div class="qr-etiket">Защо е верен</div>` +
            `<div>${escapeHtml(verdict.explanation || '')}</div></div>`;
        }

        // Останалите грешни опции — свити, за да не затрупват главното.
        const drugi = Object.keys(zashto)
          .map(Number)
          .filter((j) => j !== idx && j !== veren && zashto[String(j)])
          .sort((a, b) => a - b);
        if (drugi.length) {
          razbor +=
            `<details class="qr-drugi"><summary>Защо и останалите са грешни</summary>` +
            drugi.map((j) =>
              `<div class="qr-red"><div class="qr-etiket">` +
              `<span class="qr-bukva qr-b-greshna">${bukvaOpcia(j)}</span></div>` +
              `<div>${escapeHtml(zashto[String(j)])}</div></div>`).join('') +
            `</details>`;
        }

        if (verdict.methodNote) {
          razbor += `<div class="qr-metod"><strong>Методическа бележка:</strong> ` +
                    `${escapeHtml(verdict.methodNote)}</div>`;
        }

        const explainEl = el(`<div class="quiz-explain qr">${razbor}</div>`);
        $('.quiz-options').after(explainEl);

        // Replace actions
        $('.quiz-actions').innerHTML = `
          <span style="font-size:12px;color:${isCorrect ? 'var(--green)' : 'var(--red)'};font-weight:500;">${isCorrect ? '+1 точка' : '0 точки'}</span>
          <button class="btn btn-gold" id="nextQ">Следващ въпрос →</button>
        `;
        $('#nextQ').addEventListener('click', () => { qIdx++; renderQ(); });
      });
    });
  }

  // Normalize answer for fuzzy matching: lowercase, trim, remove punctuation, collapse whitespace
  function normalizeAnswer(s) {
    if (!s) return '';
    return String(s)
      .toLowerCase()
      .replace(/[.,;:!?"'„""«»()\-–—/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  renderTopicSelect();
}

export { renderQuiz };
