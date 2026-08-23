/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { CONSPECT_CONTENT } from './03-conspect-content.js';
import { escapeHtml } from './10-helpers.js';

/* ============================================================================
   GLOSSARY — сложни юридически термини с определения
   При клик показва popup с обяснение.
   ============================================================================ */
const LEGAL_GLOSSARY = {
  // Латински термини
  'ex nunc': '<strong>„от сега"</strong> — правно действие само за напред, без обратна сила. Пример: решенията на КС за противоконституционност действат ex nunc — не се засягат вече изпълнени отношения.',
  'ex tunc': '<strong>„от тогава"</strong> — правно действие с обратна сила, от момента на самото деяние. Обратно на ex nunc.',
  'vacatio legis': '<strong>„отсъствие на закон"</strong> — период между обнародването на закон и влизането му в сила. Обичайно 3 дни, но може по-дълъг за сложни закони. Дава време на гражданите да се запознаят.',
  'ordre public': '<strong>„обществен ред"</strong> — френски термин от МЧП. Изключение, при което съдът отказва да приложи чуждо право, ако то противоречи на основните принципи на българското право.',
  'pacta sunt servanda': '<strong>„договорите се спазват"</strong> — основен принцип на договорното право. Веднъж сключен договор, обвързва страните. Едностранна промяна не се допуска (освен при уговорка или закон).',
  'nemo plus juris': '<strong>„никой не може повече права"</strong> — nemo plus juris ad alium transferre potest quam ipse haberet. Никой не може да прехвърли на друг повече права, отколкото сам има. Основа на деривативното придобиване.',
  'lex specialis derogat generali': '<strong>„специалната норма отменя общата"</strong> — при колизия между специална и обща норма прилага се специалната в нейния обхват.',
  'lex posterior derogat priori': '<strong>„новата норма отменя старата"</strong> — при колизия между две норми с еднаква сила прилага се по-новата.',
  'rebus sic stantibus': '<strong>„при така стоящите обстоятелства"</strong> — принцип, според който при съществена промяна на обстоятелствата договорът може да се преразгледа. Спорно приложение в българското право.',
  'culpa in contrahendo': '<strong>„вина при преговорите"</strong> — преддоговорна отговорност. При недобросъвестни действия по време на преговори (напр. прекратяване без основание) — отговорност за нанесени вреди.',
  'dolus': '<strong>умисъл</strong> — в гражданското право означава измама/зла воля. В наказателното право — форма на вина, при която деецът съзнава общественоопасния характер на деянието и иска или се примирява с настъпването на резултата.',
  'ratio legis': '<strong>„смисълът на закона"</strong> — целта, преследвана от нормата. Използва се при телеологичното (целево) тълкуване — какво законодателят е искал да постигне.',
  'erga omnes': '<strong>„срещу всички"</strong> — абсолютно право, което действа спрямо всички лица (напр. право на собственост). Обратно на относителните права, които действат само между конкретни лица.',
  'inter partes': '<strong>„между страни"</strong> — относително правоотношение, което действа само между конкретните страни (напр. договор).',
  'in dubio pro reo': '<strong>„при съмнение — в полза на обвиняемия"</strong> — принцип в наказателното право. При съмнение относно вината — оправдателна присъда.',
  'nulla poena sine lege': '<strong>„няма наказание без закон"</strong> — принцип за законоустановеност. Никой не може да бъде наказан, освен за деяние, обявено от закона за престъпление (чл. 5 КРБ).',
  'iustitia': '<strong>справедливост</strong> — една от основните ценности на римското право. „Ius est ars boni et aequi" — правото е изкуство за доброто и справедливото.',
  'in personam': '<strong>„срещу лицето"</strong> — иск или право, насочено срещу конкретно лице (обичайно облигационно).',
  'in rem': '<strong>„срещу вещта"</strong> — иск или право, насочено към конкретна вещ (обичайно вещноправно).',

  // Конституционно право
  'индемнитет': '<strong>Материалноправна страна на имунитета</strong> — наказателна неотговорност на народните представители за изразени мнения и гласувания в НС. Действа <strong>завинаги</strong> (дори след мандата). Основа: чл. 69 КРБ.',
  'имунитет': '<strong>Защита от преследване</strong>, свързана с длъжностното положение. Гарантира независимост. Има <strong>материалноправна</strong> (индемнитет) и <strong>процесуалноправна</strong> (неприкосновеност) страна.',
  'легислатура': '<strong>Периодът, за който е избрано НС</strong> — в България 4 години. Започва с първото заседание. Приключва с изтичане на мандата или предсрочен разпуск.',
  'импийчмънт': '<strong>Процедура за снемане на президент от длъжност</strong> — за държавна измяна или нарушение на КРБ. НС гласува с 2/3 мнозинство обвинителен акт → КС решава. Двуетапна процедура (чл. 103).',
  'преамбюл': '<strong>Уводна част</strong> на КРБ. Прокламира основни ценности и историческа приемственост. Няма конкретни норми, но има тълкувателна сила.',
  'ратификация': '<strong>Официално потвърждаване</strong> на международен договор от НС. Ратифицирани и обнародвани договори стават част от вътрешното право (чл. 5, ал. 4 КРБ). Имат предимство пред законите.',
  'учредителна власт': '<strong>Първична власт</strong>, която създава конституцията (pouvoir constituant). Принадлежи на народа — упражнява се чрез ВНС или референдум. Различно от учредена власт (установени органи).',
  'плурализъм': '<strong>Политически плурализъм</strong> — принцип, според който съществуват множество партии и идеологии. Никаква не може да се обявява за държавна (чл. 11 КРБ).',
  'суверенитет': '<strong>Върховна и независима държавна власт</strong>. Вътрешен — над всички в държавата; външен — независим от други държави. Носител: народът (чл. 1, ал. 2 КРБ).',
  'вето': '<strong>Право на президента</strong> да върне закон за ново обсъждане. В България — само отлагателно (чл. 101). При повторно приемане с абсолютно мнозинство (121+) — задължително обнародва.',
  'кворум': '<strong>Минимален брой представители</strong>, необходими за валидно заседание. В НС — над половината (121+). При липса на кворум — заседанието се прекратява.',

  // Гражданско право
  'дееспособност': '<strong>Способност на лицето</strong> да упражнява права и задължения. Възниква с пълнолетие (18 г.). Малолетни (до 14) — недееспособни; непълнолетни (14-18) — ограничено дееспособни.',
  'правоспособност': '<strong>Способност да бъдеш носител</strong> на права и задължения. Възниква с раждането и се прекратява със смъртта. Принадлежи на всеки човек (чл. 1 ЗЛС).',
  'нищожност': '<strong>Абсолютна недействителност</strong> — сделката не поражда правни последици от началото. Всяко заинтересовано лице може да иска. Съдът я констатира служебно. Не се погасява с давност.',
  'унищожаемост': '<strong>Относителна недействителност</strong> — сделката е валидна, но може да отпадне по искане на засегната страна. Срок 3 г. (чл. 32 ЗЗД). При потвърждаване — окончателно валидна.',
  'деликт': '<strong>Неправомерно действие</strong>, което причинява вреди. Води до отговорност за обезщетение по чл. 45 ЗЗД. Изисква: виновно поведение, вреда, причинна връзка.',
  'сделка': '<strong>Правомерно волево действие</strong> за пораждане, изменение или прекратяване на правоотношение. Основа: чл. 8 ЗЗД. Основен инструмент в правния оборот.',
  'цесия': '<strong>Прехвърляне на вземане</strong> — старият кредитор (цедент) прехвърля вземането си на нов (цесионер). Не изисква съгласие на длъжника, но е нужно уведомяване. Чл. 99 ЗЗД.',
  'потестативно право': '<strong>Право с едностранно волеизявление</strong> да се измени правоотношение (напр. право на отказ, унищожение, разваляне). Не изисква съгласие на другата страна.',
  'притезателно право': '<strong>Материалноправно право</strong> да се изисква конкретно действие или бездействие от друго лице. Обичайно вземания. Подлежи на погасителна давност.',
  'давност': '<strong>Изтичане на срок</strong>, водещо до правни последици. <strong>Погасителна</strong> — изгубване на правото на иск (обикновено 5 г.). <strong>Придобивна</strong> — придобиване на право (напр. собственост при владение 10 г.).',
  'добросъвестност': '<strong>Правно предположение</strong>, че лицето действа честно и не знае за пороци. Влияе върху много институти — придобивна давност, защита при недействителност, реституция.',
  'реституция': '<strong>Възстановяване на предишното положение</strong> — при недействителност на сделка страните връщат полученото. Основа: чл. 34 ЗЗД + правила за неоснователно обогатяване.',
  'диспозитивен': '<strong>Диспозитивна норма</strong> — прилага се само при мълчание на страните. Могат да се променят с уговорка. Обратно на императивна (задължителна) норма.',
  'императивен': '<strong>Императивна норма</strong> — задължителна, не може да се променя с уговорка. Пример: защита на слаба страна, добри нрави. Нарушение → нищожност.',
  'кауза': '<strong>Правно основание на сделката</strong> — целта, за която се сключва. При липса → нищожност (чл. 26 ал. 1 ЗЗД). При абстрактни сделки (напр. менителница) не се проверява.',
  'представителство': '<strong>Действие в правния оборот за друг</strong> — от името и за сметка на представлявания. Правните последици за представлявания. Основа: чл. 36-45 ЗЗД.',
  'запрещение': '<strong>Съдебен акт</strong>, който ограничава или изключва дееспособността на лице поради тежка психична болест. <strong>Пълно</strong> — както малолетно; <strong>ограничено</strong> — както непълнолетно.',

  // Наказателно право
  'вменяемост': '<strong>Способност</strong> на дееца да разбира свойството и значението на извършеното и да ръководи постъпките си. Възниква с определена възраст и психично здраве. При липса → невменяемост → не наказателна отговорност.',
  'умисъл': '<strong>Форма на вина</strong> — деецът съзнава общественоопасния характер на деянието. <strong>Пряк</strong> — иска резултата; <strong>евентуален</strong> — примирява се с него.',
  'непредпазливост': '<strong>Форма на вина</strong> — деецът не съзнава последиците, но е могъл и е бил длъжен. <strong>Небрежност</strong> — не е предвидил; <strong>самонадеяност</strong> — предвидил, но лекомислено се надявал да не настъпят.',
  'рецидив': '<strong>Повторно извършване</strong> на престъпление от лице, което вече е било осъждано. Обстоятелство, водещо до по-тежко наказание.',
  'вина': '<strong>Психичното отношение</strong> на дееца към деянието и резултата. Форми: <strong>умисъл</strong> (пряк, евентуален) и <strong>непредпазливост</strong> (небрежност, самонадеяност).',
  'съучастие': '<strong>Съвместно извършване</strong> на престъпление от няколко лица. Съучастници: извършител, подбудител, помагач. Отговорност — според ролята и вината (чл. 20 НК).',
  'амнистия': '<strong>Общ акт</strong> на НС със закон — освобождава от наказание за категория престъпления или лица. Различно от <strong>помилване</strong> (индивидуално, от президент).',
  'помилване': '<strong>Индивидуален акт</strong> на президента — прощава изтърпяване на наказание. Не отменя присъдата. Различно от амнистия (обща, от НС).',

  // Административно/процесуално
  'юрисдикция': '<strong>Правомощието</strong> на съдебен орган да разглежда конкретни дела. Определя се според територия, предмет и вид на делото.',
  'касация': '<strong>Извънредно обжалване</strong> пред върховна инстанция (ВКС/ВАС). Проверява само законосъобразността, не факти.',
  'легитимност': '<strong>Правно право</strong> да инициираш или участваш в конкретно производство. Различно от политическа легитимност (обществено признание).',
  'пропорционалност': '<strong>Принцип</strong>, според който мярка/ограничение трябва да е подходящо, необходимо и съразмерно на легитимната цел. Основен елемент на правовата държава.',
  'субсидиарност': '<strong>Принцип</strong>, според който по-висшият орган се намесва само когато по-нискостоящият не може. В ЕС — компетентността се упражнява там, където е най-ефективно.',
  'преюдициално запитване': '<strong>Искане</strong> от национален съд до СЕС за тълкуване на ЕС правото. Задължително при съмнения на върховни съдилища. Решенията на СЕС са задължителни.',
};

/* Highlight glossary terms in a rendered container and wire up popup */
function highlightGlossary(rootElement) {
  if (!rootElement) return;
  const terms = Object.keys(LEGAL_GLOSSARY).sort((a, b) => b.length - a.length);
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Boundaries — not preceded/followed by cyrillic/latin letter
  const regex = new RegExp('(?<![а-яА-Яa-zA-Zёй])(' + escaped.join('|') + ')(?![а-яА-Яa-zA-Zёй])', 'gi');

  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest('script, style, .gterm, .gterm-popup, a, button, input, textarea')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  nodes.forEach(textNode => {
    const text = textNode.textContent;
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.substring(lastIdx, m.index)));
      }
      const span = document.createElement('span');
      span.className = 'gterm';
      const matched = m[0].toLowerCase();
      let canonical = matched;
      for (const t of terms) {
        if (t.toLowerCase() === matched) { canonical = t; break; }
      }
      span.dataset.term = canonical;
      span.textContent = m[0];
      frag.appendChild(span);
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.substring(lastIdx)));
    }
    textNode.parentNode.replaceChild(frag, textNode);
  });
}

let __gtermPopupCloser = null;
function showGlossaryPopup(termEl) {
  const existing = document.querySelector('.gterm-popup');
  if (existing) existing.remove();
  if (__gtermPopupCloser) { document.removeEventListener('click', __gtermPopupCloser); __gtermPopupCloser = null; }

  const term = termEl.dataset.term;
  const definition = LEGAL_GLOSSARY[term];
  if (!definition) return;

  const popup = document.createElement('div');
  popup.className = 'gterm-popup';
  popup.innerHTML =
    '<div class="gterm-popup-head">' +
      '<strong>' + escapeHtml(term) + '</strong>' +
      '<button class="gterm-close" aria-label="Затвори">×</button>' +
    '</div>' +
    '<div class="gterm-popup-body">' + definition + '</div>';

  document.body.appendChild(popup);

  const rect = termEl.getBoundingClientRect();
  const popRect = popup.getBoundingClientRect();
  let top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;
  // Keep within viewport
  if (left + popRect.width > window.scrollX + window.innerWidth - 12) {
    left = window.scrollX + window.innerWidth - popRect.width - 12;
  }
  if (left < 12) left = 12;
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';

  popup.querySelector('.gterm-close').addEventListener('click', function(e) {
    e.stopPropagation();
    popup.remove();
  });

  setTimeout(() => {
    __gtermPopupCloser = function(e) {
      if (!popup.contains(e.target) && !termEl.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', __gtermPopupCloser);
        __gtermPopupCloser = null;
      }
    };
    document.addEventListener('click', __gtermPopupCloser);
  }, 0);

  // ESC to close
  const escHandler = function(e) {
    if (e.key === 'Escape') {
      popup.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// Global click delegation for gterms
document.addEventListener('click', function(e) {
  const term = e.target.closest('.gterm');
  if (term) {
    e.stopPropagation();
    showGlossaryPopup(term);
  }
});

function getConspect(subjId) {
  // Full sectioned content (year 3 subjects from uploaded materials)
  if (window.PA_DATA && window.PA_DATA.conspectFull && window.PA_DATA.conspectFull[subjId]) {
    return window.PA_DATA.conspectFull[subjId];
  }
  // Legacy summarized format
  if (window.PA_DATA && window.PA_DATA.conspect && window.PA_DATA.conspect[subjId]) {
    return window.PA_DATA.conspect[subjId];
  }
  if (CONSPECT_CONTENT[subjId]) return CONSPECT_CONTENT[subjId];
  // Generate from chapter titles
  const subj = SUBJECTS.find(s => s.id === subjId);
  if (!subj) return [];
  return subj.chapters.map(ch => ({
    heading: ch,
    paragraphs: [
      'Темата "' + ch + '" е централна в дисциплината "' + subj.name + '". Разглежда основните понятия, правната уредба и практическото приложение.',
      'Изложението следва структуриран подход: дефиниция, признаци, правен режим, връзка с други институти, съдебна практика. Препоръчителна е работата с флашкартите и казусите към темата след прочит.',
      'Подробно разработен материал по темата е достъпен в платформата с препратки към действащото законодателство и актуалната съдебна практика на ВКС.'
    ]
  }));
}

export { LEGAL_GLOSSARY, __gtermPopupCloser, getConspect, highlightGlossary, showGlossaryPopup };
