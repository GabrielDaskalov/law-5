/* Автоматично добавени връзки при разделянето на монолита. */
import { $, el } from './10-helpers.js';

/* =============================================================================
   PAGES — Landing
   ============================================================================= */
function renderLanding() {
  $('#app').innerHTML = `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <span class="eyebrow">Подготовка за юридически изпити</span>
          <h1 style="margin-top:14px;">Изпитът се печели <span class="accent">преди</span> залата.</h1>
          <p class="lead">Структурирани пакети по дисциплини с лекции, конспекти, флашкарти и персонален план за изпит. За студенти от всички български юридически факултети.</p>
          <div class="live-counter" id="liveCounter">
            <span class="live-dot"></span>
            <span id="liveNum">247</span> студенти учат в момента
          </div>
          <div class="hero-actions">
            <a href="#/packages" class="btn btn-gold btn-lg">Разгледай пакетите →</a>
            <a href="#/about" class="btn btn-outline btn-lg">Виж как работи</a>
          </div>
          <div class="hero-stats">
            <div class="hero-stat"><div class="num">1 240+</div><div class="lbl">Активни студенти</div></div>
            <div class="hero-stat"><div class="num">18</div><div class="lbl">Дисциплини</div></div>
            <div class="hero-stat"><div class="num">94%</div><div class="lbl">Успеваемост</div></div>
          </div>
        </div>
        <div class="hero-mockup">
          <div class="hero-mockup-head">
            <div class="hero-mockup-tag">МОЯТА ТАБЛО</div>
            <div style="display:flex;gap:4px;">
              <div style="width:6px;height:6px;background:var(--gold);border-radius:50%;"></div>
              <div style="width:6px;height:6px;background:rgba(255,255,255,0.25);border-radius:50%;"></div>
              <div style="width:6px;height:6px;background:rgba(255,255,255,0.25);border-radius:50%;"></div>
            </div>
          </div>
          <div class="hero-mockup-title">Конституционно право</div>
          <svg viewBox="0 0 100 100" width="100" height="100" class="hero-ring" style="margin: 0 auto 20px; display:block;">
            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="6"/>
            <circle cx="50" cy="50" r="45" fill="none" stroke="#C9A35D" stroke-width="6" stroke-linecap="round"
                    stroke-dasharray="282.74" stroke-dashoffset="67.86"
                    transform="rotate(-90 50 50)"
                    style="animation: ringFill 1.4s ease-out forwards;"/>
            <text x="50" y="55" text-anchor="middle" fill="#fff" font-size="20" font-family="Playfair Display, serif" font-weight="500">76%</text>
          </svg>
          <style>@keyframes ringFill { from { stroke-dashoffset: 282.74; } to { stroke-dashoffset: 67.86; } }</style>
          <div class="hero-tiles">
            <div class="hero-tile">
              <div class="hero-tile-lbl">До изпита</div>
              <div class="hero-tile-val">23 дни</div>
            </div>
            <div class="hero-tile">
              <div class="hero-tile-lbl">Карти днес</div>
              <div class="hero-tile-val" style="color:#fff;">19 / 30</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="features section">
      <div class="container">
        <div style="text-align:center;max-width:640px;margin:0 auto 24px;">
          <span class="eyebrow">Защо Law+</span>
          <h2 style="margin-top:14px;">Всичко необходимо за един успешен семестър — на едно място.</h2>
        </div>
        <div class="features-grid">
          <div class="feature">
            <div class="feature-icon">${iconSvg('document')}</div>
            <h4>Разработени теми</h4>
            <p>Целият учебен материал е разработен и подреден по теми от специалисти. Без търсене и компилиране — всичко на едно място.</p>
          </div>
          <div class="feature">
            <div class="feature-icon">${iconSvg('cards')}</div>
            <h4>Флашкарти с въпроси</h4>
            <p>Над 10 000 готови карти с въпроси и отговори по всяка дисциплина. Метод на интервалното повторение.</p>
          </div>
          <div class="feature">
            <div class="feature-icon">${iconSvg('cases')}</div>
            <h4>Казуси с решения</h4>
            <p>Стотици разработени казуси с факти, въпроси и пълни решения. Подредени по теми — точно както в изпита.</p>
          </div>
          <div class="feature">
            <div class="feature-icon">${iconSvg('check')}</div>
            <h4>Тестове по теми</h4>
            <p>Решаваш тестове върху избрани теми или върху целия материал. Незабавно обяснение към всеки отговор.</p>
          </div>
          <div class="feature">
            <div class="feature-icon">${iconSvg('calendar')}</div>
            <h4>Персонален план</h4>
            <p>Задаваш дата и тип на изпита (устен/писмен), избираш кои теми влизат — системата изготвя план до деня.</p>
          </div>
          <div class="feature">
            <div class="feature-icon">${iconSvg('clock')}</div>
            <h4>Изпити и колоквиуми</h4>
            <p>Обратно броене до всеки изпит и колоквиум. Никога не пропускаш кога и за какво трябва да си готов.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0;">
      <div class="container">
        <div style="text-align:center;max-width:640px;margin:0 auto 8px;">
          <span class="eyebrow">Мнения на студенти</span>
          <h2 style="margin-top:14px;">Какво казват тези, които вече са издържали.</h2>
        </div>
        <div class="testimonials-grid">
          <div class="testimonial">
            <div class="testimonial-stars">★★★★★</div>
            <div class="quote">Издържах Облигационно право с отличен 6.00. Флашкартите с SRS алгоритъма ми свършиха работа — не помня друг път да съм запомнял толкова материал за толкова кратко.</div>
            <div class="author">
              <div class="initials">МД</div>
              <div class="author-info">
                <div class="name">Мария Димитрова</div>
                <div class="role">СУ „Св. Климент Охридски", 3 курс</div>
              </div>
            </div>
          </div>
          <div class="testimonial">
            <div class="testimonial-stars">★★★★★</div>
            <div class="quote">Функцията „Тегли билет" ме спаси на устния изпит по НП. Знаех точно как да си напиша плана за 30 минути, защото го бях правил стотици пъти. Инвестицията си заслужава.</div>
            <div class="author">
              <div class="initials">ГП</div>
              <div class="author-info">
                <div class="name">Георги Петров</div>
                <div class="role">ПУ „Паисий Хилендарски", 3 курс</div>
              </div>
            </div>
          </div>
          <div class="testimonial">
            <div class="testimonial-stars">★★★★★</div>
            <div class="quote">Казусите с решения по теми — точно от това имах нужда. Вместо да преписвам от учебника, разбирам логиката. За една седмица преминах през целия конспект.</div>
            <div class="author">
              <div class="initials">АС</div>
              <div class="author-info">
                <div class="name">Ана Стоянова</div>
                <div class="role">НБУ, 4 курс</div>
              </div>
            </div>
          </div>
          <div class="testimonial">
            <div class="testimonial-stars">★★★★★</div>
            <div class="quote">Персоналният план до изпита ме държеше в рамките. Всеки ден знаех какво трябва да покрия. Първо издържан изпит от началото на семестъра — без стрес.</div>
            <div class="author">
              <div class="initials">ИИ</div>
              <div class="author-info">
                <div class="name">Иван Иванов</div>
                <div class="role">СУ „Св. Климент Охридски", 3 курс</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0;">
      <div class="container">
        <div class="cta-band" style="background:var(--navy);color:#fff;border-radius:var(--radius-l);padding:56px;display:grid;grid-template-columns:1fr auto;gap:40px;align-items:center;">
          <div>
            <h2 style="color:#fff;font-size:30px;margin-bottom:10px;">Готов ли си да започнеш?</h2>
            <p style="color:rgba(255,255,255,0.75);font-size:15px;margin:0;">Регистрирай се безплатно и получи 5 примерни карти от всяка дисциплина.</p>
          </div>
          <a href="#/register" class="btn btn-gold btn-lg">Започни безплатно</a>
        </div>
      </div>
    </section>
  `;
  // animate live counter subtly
  setTimeout(() => {
    const el = document.getElementById('liveNum');
    if (!el) return;
    setInterval(() => {
      const base = 247;
      el.textContent = base + Math.floor(Math.random() * 12);
    }, 4000);
  }, 500);
}

function iconSvg(name) {
  const icons = {
    book: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4.5v15a1.5 1.5 0 0 1 1.5-1.5H20V3H5.5A1.5 1.5 0 0 0 4 4.5z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    cards: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h14v14"/></svg>',
    document: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h10l4 4v14H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>',
    calendar: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
    shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    upload: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>',
    cases: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M3 13h18"/></svg>',
    clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    oral: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18v3l4-3h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
    written: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h6v6"/></svg>',
    pen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    brain: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9.5 3a2.5 2.5 0 0 0-2.45 2 3 3 0 0 0-2.05 4.4 3 3 0 0 0 .5 4.6A3 3 0 0 0 7 19a2.5 2.5 0 0 0 5 0V5.5A2.5 2.5 0 0 0 9.5 3z"/><path d="M14.5 3a2.5 2.5 0 0 1 2.45 2 3 3 0 0 1 2.05 4.4 3 3 0 0 1-.5 4.6A3 3 0 0 1 17 19a2.5 2.5 0 0 1-5 0"/></svg>',
    ticket: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M9 6v12" stroke-dasharray="2 2"/></svg>',
  };
  return icons[name] || '';
}

export { iconSvg, renderLanding };
