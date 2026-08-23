/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { backendReady, saveState } from './09-backend-integraciya.js';
import { $, escapeHtml, isLoggedIn, toast, updateNav } from './10-helpers.js';
import { todayStr } from './11-topic-progress-streak-theme.js';
import { Activity } from './14-data-service.js';
import { API } from './15-api.js';

/* =============================================================================
   PAGES — Settings (account, password, email, GDPR)
   ============================================================================= */
function renderSettings() {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const u = state.user;

  // Трета стъпка от прогресивната реакция. Съобщението идва от сървъра и се
  // показва точно тук, над формата — човекът трябва да види какво се иска и
  // веднага да може да го направи, а не да го търси.
  //
  // Бележката НЕ се трие при прочитане, а чак когато паролата бъде сменена.
  // Иначе изчезва при първото пререрисуване на екрана — а екранът се
  // пререрисува веднага, защото и провалените заявки водят тук.
  let iskaParola = '';
  try {
    const v = sessionStorage.getItem('pa_iska_parola');
    if (v) {
      iskaParola = v === '1'
        ? 'За да продължиш, смени паролата си. Това изхвърля всички други устройства от акаунта.'
        : v;
    }
  } catch (e) { /* без хранилище */ }

  const prefs = state.notifPrefs || {};
  const purchases = state.purchased || [];
  $('#app').innerHTML = `
    <section class="page-head"><div class="container">
      <a href="#/dashboard" style="font-size:13px;color:var(--text-3);text-decoration:none;">← Табло</a>
      <h1 style="margin-top:10px;">Настройки на акаунта</h1>
      <p>Управлявай профила, паролата, известията и личните си данни.</p>
    </div></section>

    <section style="padding-bottom:80px;"><div class="container" style="max-width:780px;">

      <div class="settings-card">
        <h3>Профил</h3>
        <div class="settings-field">
          <label>Име</label>
          <div class="settings-row">
            <input id="setName" type="text" value="${escapeHtml(u.name || '')}">
            <button class="btn btn-outline" onclick="window.__setSaveName()">Запази</button>
          </div>
        </div>
        <div class="settings-field">
          <label>Email <span style="color:${u.emailVerified ? '#15803d' : '#c2410c'};font-size:11px;margin-left:8px;">${u.emailVerified ? '✓ потвърден' : '⚠ непотвърден'}</span></label>
          <div class="settings-row">
            <input id="setEmail" type="email" value="${escapeHtml(u.email || '')}">
            <button class="btn btn-outline" onclick="window.__setSaveEmail()">Промени</button>
          </div>
          <div class="settings-hint">При смяна на email ще ти изпратим линк за потвърждение на новия адрес.</div>
        </div>
      </div>

      <div class="settings-card"${iskaParola ? ' id="setPwCard"' : ''}>
        <h3>Парола</h3>
        ${iskaParola ? `<div class="settings-iska-parola">${escapeHtml(iskaParola)}</div>` : ''}
        <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:14px;">
          Смяната на паролата изхвърля всички устройства, включително това.
          Ще трябва да влезеш отново.
        </p>
        <div class="settings-field">
          <label>Текуща парола</label>
          <input id="setPwOld" type="password" autocomplete="current-password">
        </div>
        <div class="settings-field">
          <label>Нова парола (минимум 8 символа)</label>
          <input id="setPwNew" type="password" autocomplete="new-password">
        </div>
        <div class="settings-field">
          <label>Повтори новата парола</label>
          <input id="setPwRep" type="password" autocomplete="new-password">
        </div>
        <button class="btn btn-gold" onclick="window.__setChangePw()">Промени паролата</button>
      </div>

      <div class="settings-card">
        <h3>Устройства</h3>
        <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:6px;">
          Един акаунт работи на едно устройство в даден момент. Влезеш ли
          отнякъде другаде, предишното излиза автоматично.
        </p>
        <div id="setUstrojstva" style="margin-top:12px;color:var(--text-3);font-size:13px;">Зарежда се…</div>
      </div>

      <div class="settings-card">
        <h3>Известия</h3>
        ${[
          {k:'dailyReminder', label:'Дневно напомняне за SRS повторение', sub:'Един имейл сутрин, ако имаш карти за повторение.'},
          {k:'weeklyReport', label:'Седмичен отчет за прогреса', sub:'Колко си учил миналата седмица, какви теми ти вървят.'},
          {k:'newContent', label:'Известия за ново съдържание', sub:'Когато добавя нови теми, казуси или функции.'},
          {k:'marketing', label:'Маркетинг и оферти', sub:'Промоции, специални пакети, отстъпки.'},
        ].map(p => `
          <label class="settings-toggle">
            <input type="checkbox" ${prefs[p.k] ? 'checked' : ''} onchange="window.__setPref('${p.k}', this.checked)">
            <span class="settings-toggle-label">${p.label}</span>
            <span class="settings-toggle-sub">${p.sub}</span>
          </label>`).join('')}
      </div>

      <div class="settings-card">
        <h3>Закупени пакети</h3>
        ${purchases.length === 0
          ? '<p style="color:var(--text-3);font-size:13px;">Все още нямаш закупени пакети. <a href="#/pricing" style="color:var(--gold);">Виж пакетите →</a></p>'
          : `<table class="adm-table" style="margin-top:8px;"><thead><tr><th>Пакет</th><th>Купен на</th><th>Достъп</th></tr></thead><tbody>
            ${purchases.map(pid => {
              const s = SUBJECTS.find(x => x.id === pid);
              return `<tr><td>${escapeHtml(s ? s.name : pid)}</td><td>${new Date(state.userCreatedAt || Date.now()).toLocaleDateString('bg-BG')}</td><td><span style="color:#15803d;">✓ активен</span></td></tr>`;
            }).join('')}</tbody></table>`}
      </div>

      <div class="settings-card">
        <h3>Личните ти данни (GDPR)</h3>
        <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:14px;">
          Имаш право да изтеглиш всичките си данни (прогрес, SRS, история, плащания) или да поискаш изтриване на акаунта си. Това са правата ти по член 15 и 17 от GDPR.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-outline" onclick="window.__setExportData()">📥 Свали моите данни</button>
          <button class="btn btn-outline" onclick="location.hash='#/privacy'">📄 Прочети Privacy Policy</button>
        </div>
      </div>

      <div class="settings-card settings-danger">
        <h3>Опасна зона</h3>
        <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:14px;">
          Изтриването на акаунта започва 30-дневен grace период. През този период можеш да възстановиш, като влезнеш отново. След 30 дни данните се изтриват необратимо.
        </p>
        <button class="btn btn-outline" style="color:#b91c1c;border-color:#fecaca;" onclick="window.__setDeleteAccount()">🗑 Изтрий акаунта ми</button>
      </div>

    </div></section>`;

  void napalniUstrojstva();

  if (iskaParola) {
    // Скролва до формата, вместо да оставя човека да я търси в дълга страница.
    setTimeout(() => {
      const k = $('#setPwCard');
      if (k) k.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const pole = document.getElementById('setPwOld');
      if (pole) pole.focus();
    }, 120);
  }
}

/**
 * Списъкът с устройства се тегли отделно, след като екранът е нарисуван.
 * Иначе цялата страница с настройките би чакала една заявка, която е
 * най-маловажната на нея.
 */
async function napalniUstrojstva() {
  const kutiya = $('#setUstrojstva');
  if (!kutiya) return;

  if (!(await backendReady())) {
    kutiya.innerHTML = '<span style="color:var(--text-3);">Без свързан сървър устройствата не се следят.</span>';
    return;
  }

  let d;
  try {
    d = await API.sessions();
  } catch (e) {
    kutiya.innerHTML = '<span style="color:var(--text-3);">Списъкът не можа да се зареди.</span>';
    return;
  }

  const kogaShort = (v) => {
    const t = new Date(v);
    const minuti = Math.round((Date.now() - t.getTime()) / 60000);
    if (minuti < 2) return 'сега';
    if (minuti < 60) return 'преди ' + minuti + ' мин';
    if (minuti < 60 * 24) return 'преди ' + Math.round(minuti / 60) + ' ч';
    return t.toLocaleDateString('bg-BG');
  };
  const ikona = (ime) => (/iPhone|Android|iPad/i.test(ime || '') ? '📱' : '💻');

  const redove = (d.sesii || []).map((s) => `
    <div class="ustrojstva-red">
      <span class="u-ikona">${ikona(s.device_label)}</span>
      <div class="u-glavno">
        <div class="u-ime">${escapeHtml(s.device_label || 'Неизвестно устройство')}${s.tekushta ? '<span class="u-tova">това устройство</span>' : ''}</div>
        <div class="u-detajl">активно ${kogaShort(s.last_seen_at)} · влизане ${new Date(s.created_at).toLocaleDateString('bg-BG')}</div>
      </div>
      ${s.tekushta ? '' : `<button class="btn btn-outline" style="padding:5px 11px;font-size:12px;" onclick="window.__setIzklyuchiUstrojstvo('${s.id}')">Изключи</button>`}
    </div>`).join('');

  // Броят различни устройства се показва и на самия потребител: човек, чиято
  // парола е тръгнала по ръцете, вижда числото и се сеща да я смени.
  const mnogo = (d.ustrojstva_30_dni || 0) >= 5;

  // Регистърът за месеца е нещо друго от списъка отгоре: горе са тези, които
  // са ВЪТРЕ сега, а тук — тези, от които изобщо се е влизало. Второто е
  // числото, което издава споделения акаунт.
  const registar = (d.ustrojstva || []).map((x) => `
    <div class="ustrojstva-red">
      <span class="u-ikona">${ikona(x.label)}</span>
      <div class="u-glavno">
        <div class="u-ime">${escapeHtml(x.label || 'Неизвестно устройство')}${
          x.potvardeno ? '' : '<span class="u-chaka">чака потвърждение</span>'}</div>
        <div class="u-detajl">последно ${kogaShort(x.last_seen_at)} · първо влизане ${new Date(x.first_seen_at).toLocaleDateString('bg-BG')}</div>
      </div>
      <button class="btn btn-outline" style="padding:5px 11px;font-size:12px;" onclick="window.__setZabraviUstrojstvo('${x.id}')">Забрави</button>
    </div>`).join('');

  const limitU = d.limit_ustrojstva || 4;
  const nadLimit = (d.ustrojstva_30_dni || 0) >= limitU;

  kutiya.innerHTML = `
    <div style="color:var(--text-1);">${redove || '<span style="color:var(--text-3);">Няма активни устройства.</span>'}</div>
    <div class="ustrojstva-broj" style="margin-top:14px;">
      Позволени едновременно: <strong>${d.limit}</strong>
    </div>
    <button class="btn btn-outline" style="margin-top:10px;" onclick="window.__setIzhodOtVsichki()">Изход от всички устройства</button>

    <h4 style="margin:24px 0 4px;font-size:14px;">Устройства през последните 30 дни</h4>
    <div class="ustrojstva-broj">
      <strong style="${mnogo ? 'color:#b45309;' : ''}">${d.ustrojstva_30_dni || 0}</strong>
      ${(d.ustrojstva_30_dni || 0) === 1 ? 'устройство' : 'устройства'}, при лимит ${limitU}.
      ${nadLimit
        ? 'Следващото ново устройство ще иска потвърждение по имейл.'
        : 'Над лимита новото устройство се потвърждава по имейл.'}
      ${mnogo ? '<br>Ако това число те изненадва, някой друг най-вероятно знае паролата ти. Смени я.' : ''}
    </div>
    <div style="margin-top:8px;">${registar || '<span style="color:var(--text-3);font-size:13px;">Няма вписани устройства.</span>'}</div>
    <p style="font-size:12px;color:var(--text-3);margin-top:10px;line-height:1.6;">
      Продал си стар лаптоп? „Забрави“ го — това освобождава място, вместо да чакаш 30 дни.
    </p>`;
}

window.__setIzklyuchiUstrojstvo = async function (id) {
  try {
    await API.revokeSession(id);
    toast('Устройството е изключено', true);
    void napalniUstrojstva();
  } catch (e) { toast('⚠ ' + (e.message || 'Не се получи')); }
};

window.__setZabraviUstrojstvo = async function (id) {
  try {
    await API.forgetDevice(id);
    toast('Устройството е премахнато', true);
    void napalniUstrojstva();
  } catch (e) { toast('⚠ ' + (e.message || 'Не се получи')); }
};

window.__setIzhodOtVsichki = async function () {
  if (!confirm('Това ще излезе от всички устройства, включително това. Продължаваме ли?')) return;
  try {
    await API.logoutAll();
    toast('Излезе от всички устройства', true);
    setTimeout(() => { location.hash = '#/login'; location.reload(); }, 700);
  } catch (e) { toast('⚠ ' + (e.message || 'Не се получи')); }
};

window.__setSaveName = async function() {
  const name = document.getElementById('setName').value.trim();
  try { await API.updateProfile({ name }); toast('Името е запазено', true); updateNav(); } catch(e){ toast(e.message); }
};
window.__setSaveEmail = async function() {
  const newEmail = document.getElementById('setEmail').value.trim();
  if (!confirm('При смяна на email ще трябва да потвърдиш новия адрес. Продължи?')) return;
  try { await API.changeEmail({ newEmail }); toast('Email-ът е променен. Провери пощата си за линк за потвърждение.', true); renderSettings(); } catch(e){ toast(e.message); }
};
window.__setChangePw = async function() {
  const oldP = document.getElementById('setPwOld').value;
  const newP = document.getElementById('setPwNew').value;
  const rep = document.getElementById('setPwRep').value;
  if (newP !== rep) { toast('Новите пароли не съвпадат'); return; }
  try {
    const r = await API.changePassword({ currentPassword: oldP, newPassword: newP });
    document.getElementById('setPwOld').value = ''; document.getElementById('setPwNew').value = ''; document.getElementById('setPwRep').value = '';
    // Искането е изпълнено — бележката отпада заедно с него.
    try { sessionStorage.removeItem('pa_iska_parola'); sessionStorage.removeItem('pa_preduprezhdenie'); } catch (e) { /* празно */ }
    if (r && r.ponovo) {
      // Смяната сваля всички устройства, включително това — иначе човек,
      // който сменя паролата заради чужд достъп, не постига нищо.
      toast('Паролата е сменена. Влез отново с новата.', true);
      setTimeout(() => { location.hash = '#/login'; location.reload(); }, 1200);
      return;
    }
    toast('Паролата е променена', true);
  } catch(e){ toast(e.message); }
};
window.__setPref = function(k, v) {
  if (!state.notifPrefs) state.notifPrefs = {};
  state.notifPrefs[k] = v; saveState();
  Activity.log('settings.pref-change', null, { k, v });
};
window.__setExportData = async function() {
  const data = await API.exportMyData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'my-pravo-academy-data-' + todayStr() + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Данните се свалят', true);
};
window.__setDeleteAccount = async function() {
  if (!confirm('Сигурен ли си, че искаш да изтриеш акаунта си?\\n\\nЩе започне 30-дневен grace период. Прогресът, SRS-ът, плащанията — всичко ще се изгуби след това.')) return;
  if (!confirm('Наистина сигурен? Това е необратимо след 30 дни.')) return;
  // Сървърът иска текущата парола — това пази акаунта при открадната сесия.
  const parola = prompt('За потвърждение въведи текущата си парола:') || '';
  try {
    await API.deleteAccount(parola);
  } catch (e) {
    // Ако сървърът откаже, потребителят ТРЯБВА да разбере, че акаунтът му стои.
    toast('⚠ ' + (e && e.message ? e.message : 'Изтриването не бе извършено'));
    return;
  }
  toast('Акаунтът е насрочен за изтриване', true);
  setTimeout(() => { location.hash = '#/'; location.reload(); }, 1500);
};

export { renderSettings };
