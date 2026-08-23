/* =============================================================================
   MOCK DATA — Subjects
   ============================================================================= */
const SUBJECTS = [
  // ===== 1 КУРС =====
  { id: 'krb', name: 'Конституционно право на РБ', year: 1, topics: 65, lectures: 32, cards: 325, pages: 300, tagline: 'Държавно устройство, основни права, контрол.', featured: true,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.krb) || ['Предмет и източници', 'Конституция от 1991 г.', 'Основни права на гражданите', 'Народно събрание', 'Президент', 'Министерски съвет', 'Съдебна власт', 'Конституционен съд', 'Местно самоуправление'] },
  { id: 'rpp', name: 'Римско частно право', year: 1, topics: 38, lectures: 28, cards: 420, pages: 64, tagline: 'Институции на Гай, владение, сервитути.', featured: false,
    chapters: ['Източници на римското право', 'Лица и статус', 'Семейство и брак', 'Владение и собственост', 'Сервитути', 'Облигации', 'Деликти', 'Наследство'] },
  { id: 'ibdp', name: 'История на българската държава и право', year: 1, topics: 34, lectures: 24, cards: 380, pages: 68, tagline: 'От Първото царство до съвременна Република.', featured: false,
    chapters: ['Първо българско царство', 'Второ българско царство', 'Възраждане', 'Търновска конституция', 'Между двете войни', 'Народна република', 'Съвременна България'] },
  { id: 'lat', name: 'Латински език за юристи', year: 1, topics: 15, lectures: 0, cards: 491, pages: 40, tagline: 'Двупосочен превод: латински ↔ български с попълване на думи.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.lat) || ['Основни правни термини', 'Латински сентенции', 'Класически фрази', 'Съкращения', 'Правни изрази', 'Превод на текстове'] },
  { id: 'otp', name: 'Обща теория на правото', year: 1, topics: 36, lectures: 26, cards: 400, pages: 70, tagline: 'Методология, тълкуване, аксиология.', featured: false,
    chapters: ['Методология на правото', 'Тълкуване на правни норми', 'Правна аксиология', 'Правна логика', 'Юридическа техника', 'Правен ред'] },

  // ===== 2 КУРС =====
  { id: 'gpob', name: 'Гражданско право — обща част', year: 2, topics: 63, lectures: 0, cards: 63, pages: 187, tagline: 'Лица, сделки, представителство, давност.', featured: true,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.gpob) || [] },
  { id: 'vp', name: 'Вещно право', year: 2, topics: 50, lectures: 0, cards: 250, pages: 150, tagline: 'Собственост, владение, ипотека, кадастър, ЗУТ.', featured: true,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.vp) || ['Понятие за вещно право', 'Владение', 'Право на собственост', 'Придобиване по давност', 'Съсобственост', 'Етажна собственост', 'Ограничени вещни права', 'Ипотека и залог', 'Защита на собствеността', 'Кадастър и имотен регистър'] },
  { id: 'apr', name: 'Административно право', year: 2, topics: 44, lectures: 36, cards: 540, pages: 88, tagline: 'Актове, производство, контрол.', featured: false,
    chapters: ['Предмет и източници', 'Административни органи', 'Държавна служба', 'Административни актове', 'АПК — производство', 'Съдебен контрол', 'Административна отговорност'] },
  { id: 'aps', name: 'Административно право — специална част', year: 2, topics: 40, lectures: 0, cards: 200, pages: 120, tagline: 'Отраслови режими: полиция, устройство, образование, здравеопазване.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.aps) || ['Полицейско право', 'Устройство на територията', 'Образование и наука', 'Здравеопазване', 'Транспорт и съобщения', 'Околна среда', 'Митници и данъци', 'Държавна сигурност'] },
  { id: 'eul', name: 'Право на Европейския съюз', year: 2, topics: 45, lectures: 0, cards: 225, pages: 130, tagline: 'ДЕС, ДФЕС, СЕС, директиви, основни свободи.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.eul) || ['История и институции', 'ДЕС и ДФЕС', 'Съд на ЕС', 'Директен ефект и примат', 'Свобода на движение на стоки', 'Свобода на движение на хора', 'Свобода на предоставяне на услуги', 'Свобода на капитал', 'Конкуренция', 'ХОП'] },
  { id: 'mpp', name: 'Международно публично право', year: 2, topics: 40, lectures: 32, cards: 480, pages: 82, tagline: 'Договори, държави, ООН.', featured: false,
    chapters: ['Източници на МПП', 'Субекти на МПП', 'Държавна територия', 'Международни договори', 'Дипломатическо право', 'Право на ЕС — въведение', 'Международни организации'] },
  { id: 'fp', name: 'Финансово право', year: 2, topics: 36, lectures: 28, cards: 420, pages: 76, tagline: 'Бюджет, данъци, банково.', featured: false,
    chapters: ['Финансова система', 'Бюджетно право', 'Данъчно право', 'Банково право', 'Валутно право', 'Контрол върху финансите'] },
  { id: 'le', name: 'Юридически английски', year: 2, topics: 25, lectures: 0, cards: 300, pages: 80, tagline: 'Legal terminology, contracts, EU law texts.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.le) || ['Legal system vocabulary', 'Contract law terms', 'Court procedure', 'Civil law English', 'Criminal law English', 'EU law English', 'Business & commercial', 'Human rights terminology'] },

  // ===== 3 КУРС (с интегрирани преработени материали от факултета) =====
  { id: 'oblp', name: 'Облигационно право', year: 3, topics: 64, lectures: 0, cards: 63, pages: 220, tagline: 'Договори, изпълнение, неустойка, ипотека, продажба.', featured: true,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.oblp) || [] },
  { id: 'np', name: 'Наказателен процес', year: 3, topics: 64, lectures: 0, cards: 64, pages: 320, tagline: 'Досъдебно, съдебно, обжалване, особени производства.', featured: true,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.np) || [] },
  { id: 'nk', name: 'Наказателно право', year: 3, topics: 78, lectures: 0, cards: 78, pages: 340, tagline: 'Обща и особена част на НК — престъпление, наказание, състави.', featured: true,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.nk) || [] },
  { id: 'aprc', name: 'Административен процес', year: 3, topics: 36, lectures: 0, cards: 36, pages: 130, tagline: 'АПК, индивидуални актове, обжалване, ЗАНН.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.aprc) || [] },
  { id: 'krim', name: 'Криминалистика', year: 3, topics: 50, lectures: 0, cards: 49, pages: 110, tagline: 'Следи, експертизи, разследване, разпит.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.krim) || [] },
  { id: 'nip', name: 'Наказателно изпълнително право', year: 3, topics: 25, lectures: 0, cards: 25, pages: 60, tagline: 'ЗИНЗС, лишаване от свобода, режими, освобождаване.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.nip) || [] },
  { id: 'pds', name: 'Право на държавната служба', year: 3, topics: 23, lectures: 0, cards: 23, pages: 70, tagline: 'ЗДСл, статут, служебно правоотношение, дисциплинарка.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.pds) || [] },
  { id: 'se', name: 'Съдебни експертизи', year: 3, topics: 15, lectures: 0, cards: 15, pages: 50, tagline: 'НПК и ГПК — назначаване, видове, заключение.', featured: false,
    chapters: (window.PA_DATA && window.PA_DATA.chapters && window.PA_DATA.chapters.se) || [] },
];

export { SUBJECTS };
