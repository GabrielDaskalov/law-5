/* Автоматично добавени връзки при разделянето на монолита. */
import { $ } from './10-helpers.js';

/* =============================================================================
   CONTENT PROTECTION — watermark + anti-copy on protected blocks
   ============================================================================= */
function setupContentProtection() {
  // Build copy shield element if missing
  if (!$('#copyShield')) {
    const sh = document.createElement('div');
    sh.id = 'copyShield';
    sh.className = 'copy-shield';
    sh.innerHTML = '<h4>Защитено съдържание</h4><p>Този учебен материал е достъпен само в платформата. Копирането и разпространението не са разрешени.</p>';
    document.body.appendChild(sh);
  }
  // Block copy / context menu / dragstart on .protected-content
  ['copy', 'cut', 'contextmenu', 'dragstart'].forEach(ev => {
    document.addEventListener(ev, function(e) {
      const target = e.target;
      if (!target || !target.closest) return;
      // Полетата за въвеждане са изключени: откакто защитата стои върху целия
      // екран, без това изключение търсачката, бележките и полето за отговор
      // спираха да се държат като нормални полета — а те не са учебен
      // материал, който да се пази.
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (target.closest('.protected-content')) {
        e.preventDefault();
        showCopyShield();
      }
    });
  });
  // Водният знак за печат се опреснява при всяко минаване оттук (рутерът
  // вика тази функция), за да е винаги с текущия акаунт и текущата дата.
  updatePrintWatermark();
  nalozhiVodenZnak();

  // Detect Ctrl+S / Ctrl+P on protected pages (just shield message)
  document.addEventListener('keydown', function(e) {
    const onProtected = $('.protected-content');
    if (!onProtected) return;
    // Ctrl+A в поле за въвеждане значи „маркирай това, което пиша“ — няма
    // нищо общо с копирането на материала.
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p' || e.key === 'a')) {
      e.preventDefault();
      showCopyShield();
    }
  });
}
/**
 * Екраните, върху които стои воден знак.
 *
 * Дотук белегът беше само на конспекта. Точно най-препращаното обаче е друго:
 * тестов въпрос и казус се снимат по един и хвърчат в групата на курса. Тези
 * два екрана бяха чисти.
 *
 * Списъкът е тук, а не в отделните екрани, по две причини: слага се на едно
 * място вместо на десетина места, където се рисува HTML, и новият екран
 * утре не остава случайно незащитен.
 */
const ZASHTITENI = [
  '/conspect', '/quiz', '/cases', '/flashcards',
  '/review', '/exam-draw-run', '/mistakes-review', '/notes',
];

function eZashtiten(path) {
  return ZASHTITENI.some((z) => path === z || path.startsWith(z + '/') || path.startsWith(z + '?'));
}

/**
 * Слага (или маха) водния знак върху целия екран.
 *
 * Слоят е ЕДИН и стои върху всичко в областта на съдържанието, вместо да е
 * вътре в отделните карти. Така върху снимка на екрана белегът е там,
 * независимо какво точно е снимано — един въпрос, половин казус или цялата
 * страница.
 *
 * `position: fixed` е нарочно: залепен за съдържанието, той се изгубва при
 * снимка на горната част на дълга страница.
 */
function nalozhiVodenZnak(path) {
  const app = document.getElementById('app');
  const trqbva = eZashtiten(path || (location.hash || '#/').slice(1).split('?')[0])
    && !!(typeof state !== 'undefined' && state && state.user);

  let sloj = document.getElementById('paEkranWm');

  if (!trqbva) {
    if (sloj) sloj.remove();
    if (app) app.classList.remove('protected-content');
    return;
  }

  if (!sloj) {
    sloj = document.createElement('div');
    sloj.id = 'paEkranWm';
    sloj.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sloj);
  }
  sloj.style.backgroundImage = watermarkSvg(userWatermarkText());

  // Класът пали и блокирането на копиране/десен бутон върху тези екрани.
  if (app) app.classList.add('protected-content');
}

/**
 * Воден знак и при ПЕЧАТ.
 *
 * Дотук защитата беше само на екрана: Ctrl+S и Ctrl+P се прихващаха с
 * JavaScript, но менюто на браузъра ги заобикаля с два клика и се получава
 * чист PDF без нито един белег. Тоест най-удобният начин за препращане на
 * материала беше и най-чистият.
 *
 * Сега на разпечатката стоят две неща: воден знак през цялата страница и
 * ред най-долу с имейла на акаунта. Не пречи на честния човек (може да си
 * разпечата за четене), но прави препращането лично.
 */
function updatePrintWatermark() {
  const ima = !!(typeof state !== 'undefined' && state && state.user);
  let sloj = document.getElementById('paPrintWm');
  let dolu = document.getElementById('paPrintFoot');

  if (!ima) {
    if (sloj) sloj.remove();
    if (dolu) dolu.remove();
    return;
  }

  if (!sloj) {
    sloj = document.createElement('div');
    sloj.id = 'paPrintWm';
    document.body.appendChild(sloj);
  }
  if (!dolu) {
    dolu = document.createElement('div');
    dolu.id = 'paPrintFoot';
    document.body.appendChild(dolu);
  }

  const beleg = userWatermarkText();
  sloj.style.backgroundImage = watermarkSvg(beleg);
  dolu.textContent = 'Law+ · лично копие на ' + beleg + ' · препращането се проследява';
}

function showCopyShield() {
  const sh = $('#copyShield');
  if (!sh) return;
  sh.classList.add('show');
  clearTimeout(showCopyShield._t);
  showCopyShield._t = setTimeout(() => sh.classList.remove('show'), 2400);
}

function watermarkSvg(text) {
  // Воден знак с името на акаунта, вграден като SVG.
  const t = (text || 'Law+').slice(0, 48);

  // ПОПРАВКА: дългите имейли излизаха извън платното на SVG-то и се
  // отрязваха — водният знак четеше „ivan.petrov@abv.bg · 2026-08-“ вместо
  // цялата дата. При печат това личеше най-много. `textLength` свива
  // разредката, докато текстът се побере, вместо да го отреже.
  const shirina = Math.min(300, Math.max(60, t.length * 7.2));

  const cvyat = document.documentElement.getAttribute('data-theme') === 'dark' ? '#F5F1EA' : '#0F1B2D';
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'>"
    + "<text x='160' y='100' text-anchor='middle' font-family='Inter, sans-serif' font-size='14'"
    + " textLength='" + shirina.toFixed(0) + "' lengthAdjust='spacingAndGlyphs'"
    + " fill='" + cvyat + "' font-weight='500'>"
    + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>';
  return 'url(data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg).replace(/[()']/g, function(c){ return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }) + ')';
}

function userWatermarkText() {
  if (!state.user) return 'Law+';
  const id = state.user.email || state.user.name || '';
  return id + ' · ' + new Date().toISOString().slice(0, 10);
}

export { nalozhiVodenZnak, setupContentProtection, showCopyShield, updatePrintWatermark, userWatermarkText, watermarkSvg };
