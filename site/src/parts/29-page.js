/* Автоматично добавени връзки при разделянето на монолита. */
import { $ } from './10-helpers.js';

/* =============================================================================
   PAGES — About / Contact
   ============================================================================= */
function renderAbout() {
  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <span class="eyebrow">Как работи платформата</span>
        <h1 style="margin-top:14px;">От първия час до изпита.</h1>
        <p>Law+ е изградена около научно доказани принципи за активно учене — интервално повторение, самопроверка и персонализирано планиране.</p>
      </div>
    </section>
    <section style="padding-bottom:80px;">
      <div class="container" style="max-width:780px;">
        <div style="display:flex;flex-direction:column;gap:32px;">
          ${[
            { num: '01', title: 'Избираш пакет', text: 'Разглеждаш дисциплините от твоя учебен план и купуваш една или повече дисциплини. Всеки пакет е 35 € — еднократно, достъп завинаги.' },
            { num: '02', title: 'Получаваш всичко готово', text: 'Всяка дисциплина идва с разработени теми, флашкарти с въпроси, казуси с решения и тестове. Без качване, без компилиране, без търсене на материали.' },
            { num: '03', title: 'Задаваш изпита', text: 'Въвеждаш датата на изпита, дали е устен или писмен, и колоквиумите със съответния обхват от теми.' },
            { num: '04', title: 'Изготвяш план', text: 'Избираш до коя тема ще е изпитът или колоквиумът. Системата генерира план до деня — според типа на изпита.' },
            { num: '05', title: 'Тренираш с карти, казуси и тестове', text: 'Тестовете и флашкартите се филтрират по избраните теми. Решаваш казуси преди да видиш отговора.' },
            { num: '06', title: 'Влизаш в залата подготвен', text: '94% от нашите студенти преминават изпита от първи опит. Подготовката, която дава увереност.' },
          ].map(step => `
            <div style="display:flex;gap:24px;align-items:flex-start;">
              <div class="serif" style="font-size:36px;color:var(--gold);font-weight:500;line-height:1;min-width:60px;">${step.num}</div>
              <div>
                <h3 style="font-size:20px;margin-bottom:6px;">${step.title}</h3>
                <p style="color:var(--text-2);margin:0;">${step.text}</p>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:48px;text-align:center;">
          <a href="#/packages" class="btn btn-gold btn-lg">Виж пакетите</a>
        </div>
      </div>
    </section>
  `;
}

function renderContact() {
  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <span class="eyebrow">Контакти</span>
        <h1 style="margin-top:14px;">Свържи се с нас.</h1>
        <p>Имаш въпрос за платформата, дисциплините или плащането? Пишеш ни и отговаряме до 24 часа.</p>
      </div>
    </section>
    <section style="padding-bottom:80px;">
      <div class="container" style="max-width:560px;">
        <form class="card card-raised" onsubmit="event.preventDefault(); toast('Съобщението е изпратено — отговор до 24 ч.', true); this.reset();" style="padding:32px;">
          <div class="field">
            <label>Име</label>
            <input class="input" required placeholder="Иван Иванов">
          </div>
          <div class="field">
            <label>Имейл</label>
            <input class="input" type="email" required placeholder="ivan@example.com">
          </div>
          <div class="field">
            <label>Тема</label>
            <select class="select">
              <option>Въпрос за пакетите</option>
              <option>Проблем с платформата</option>
              <option>Партньорство</option>
              <option>Друго</option>
            </select>
          </div>
          <div class="field">
            <label>Съобщение</label>
            <textarea class="textarea" rows="5" required></textarea>
          </div>
          <button class="btn btn-gold btn-block btn-lg">Изпрати съобщението</button>
        </form>
        <div style="display:flex;gap:32px;margin-top:32px;justify-content:center;font-size:13px;color:var(--text-2);flex-wrap:wrap;">
          <div>office@pravo-academy.bg</div>
          <div>+359 2 850 1234</div>
          <div>гр. София, бул. Витоша 12</div>
        </div>
      </div>
    </section>
  `;
}

export { renderAbout, renderContact };
