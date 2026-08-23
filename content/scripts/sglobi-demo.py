# -*- coding: utf-8 -*-
"""
Сглобява сайта в един файл, който работи без сървър.

Взима сглобения сайт, вгражда в него записаните отговори на API-то и слага
малък пласт, който прихваща заявките и връща записаното. Резултатът е един
.html файл — отваря се с двоен клик, без инсталации и без интернет.
"""
import base64, io, json, os, re

# Пътищата се смятат спрямо самия файл — не са зашити за конкретна машина.
TUK = os.path.dirname(os.path.abspath(__file__))
KOREN = os.path.dirname(os.path.dirname(TUK))          # папката с backend/ и site/
DIST = os.environ.get('DIST_DEMO', os.path.join(KOREN, 'site', 'dist-demo'))
SNIMKA = os.environ.get('SNIMKA_API', os.path.join(TUK, 'snimka-api.json'))
IZHOD = os.environ.get('DEMO_IZHOD', os.path.join(KOREN, 'Law-plus-demo.html'))

d = json.load(open(SNIMKA))
index = io.open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()

# Сглобката за демото е един JS и един CSS — без импорти между модули,
# затова и двата влизат направо в страницата.
css = io.open(os.path.join(DIST, 'app.css'), encoding='utf-8').read()
js = io.open(os.path.join(DIST, 'app.js'), encoding='utf-8').read()

# Заместваме с функция, а не с низ: сглобеният JS съдържа обратни наклонени
# черти и re.sub би ги изтълкувал като escape последователности.
index = re.sub(r'<link[^>]+href="[^"]*app\.css"[^>]*>',
               lambda m: '<style>\n' + css + '\n</style>', index)
index = re.sub(r'<script[^>]+src="[^"]*app\.js"[^>]*></script>',
               lambda m: '<script type="module">\n' + js + '\n</script>', index)

ostanali = re.findall(r'(?:src|href)="(/[^"]+)"', index)
if ostanali:
    print('внимание, останали външни файлове:', ostanali[:4])

# ------------------------------------------------------------ пластът
plast = '''
<script>
/* ────────────────────────────────────────────────────────────────────────
   Демонстрационен пласт.

   Сайтът обикновено тегли съдържанието от сървър. Тук отговорите на
   сървъра са записани предварително и се връщат оттук, за да може всичко
   да работи от един файл — без инсталация, без интернет, без база.

   Прихващат се само заявките към /api. Всичко останало върви нормално.
   Проверката на отговорите се смята на място: записан е верният индекс и
   обясненията, а „вярно/грешно" се решава при клика.
   ──────────────────────────────────────────────────────────────────────── */
const PA_DEMO = __DANNI__;

(function () {
  const originalen = window.fetch.bind(window);

  function otgovor(telo, status) {
    return new Response(typeof telo === 'string' ? telo : JSON.stringify(telo), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  window.fetch = async function (vhod, nastr) {
    const adres = typeof vhod === 'string' ? vhod : (vhod && vhod.url) || '';
    let pat;
    try { pat = new URL(adres, location.href).pathname + new URL(adres, location.href).search; }
    catch (e) { return originalen(vhod, nastr); }

    if (!pat.startsWith('/api') && !pat.startsWith('/health')) return originalen(vhod, nastr);

    const metod = ((nastr && nastr.method) || (vhod && vhod.method) || 'GET').toUpperCase();

    /* ---- проверка на отговор на тестов въпрос */
    const pv = pat.match(/^\\/api\\/content\\/quiz\\/([^/?]+)\\/check/);
    if (pv && metod === 'POST') {
      const k = PA_DEMO.otgovori[pv[1]];
      if (!k) return otgovor({ message: 'Няма такъв въпрос' }, 404);
      let daden = -1;
      try { daden = JSON.parse((nastr && nastr.body) || '{}').index; } catch (e) { /* празно */ }
      return otgovor({
        itemId: pv[1],
        correct: Number(daden) === k.correctIndex,
        correctIndex: k.correctIndex,
        correctAnswer: null,
        explanation: k.explanation,
        optionExplanations: k.optionExplanations,
        methodNote: k.methodNote,
      });
    }

    /* ---- решение на казус */
    const pk = pat.match(/^\\/api\\/content\\/cases\\/([^/?]+)\\/solution/);
    if (pk) {
      const r = PA_DEMO.resheniya[pk[1]];
      if (r) return otgovor(r);
    }

    /* ---- записаните отговори */
    if (PA_DEMO.zapis[pat]) return otgovor(PA_DEMO.zapis[pat]);
    const bez = pat.split('?')[0];
    for (const k of Object.keys(PA_DEMO.zapis)) {
      if (k.split('?')[0] === bez) return otgovor(PA_DEMO.zapis[k]);
    }

    /* ---- друг предмет: в демото е записано само Облигационно право.
       Връщаме празна, но валидна структура, за да не се чупи екранът —
       иначе админският панел, който по подразбиране отваря първия предмет
       от списъка, спира с грешка още преди да се види. */
    const ps = pat.match(/^\/api\/content\/subjects\/([a-z]+)/);
    if (ps) {
      return otgovor({
        id: '00000000-0000-4000-8000-000000000000', code: ps[1], slug: ps[1],
        title: 'Няма демонстрационни данни', tagline: 'В това демо е заредено само Облигационно право.',
        year: 1, featured: false, priceEur: 0,
        counts: { topics: 0, flashcards: 0, quiz: 0, cases: 0, conspects: 0 },
        access: { owned: false, preview: true, locked: false },
        topics: [],
      });
    }
    if (/^\/api\/content\/(quiz|cases|flashcards)/.test(pat.split('?')[0])) return otgovor([]);

    /* ---- профил, покупки, състояние: демо стойности */
    if (pat.startsWith('/api/user/profile'))
      return otgovor({ success: true, data: { name: 'Николай', email: 'nikolaid.business@gmail.com', role: 'admin' } });
    if (pat.startsWith('/api/me/purchases'))
      return otgovor({ success: true, data: { packages: ['oblp'], subjects: ['oblp'] } });
    if (pat.startsWith('/api/me/state'))
      return otgovor({ success: true, data: {} });
    if (pat.startsWith('/health'))
      return otgovor({ status: 'ok' });

    /* всичко друго в демото просто липсва */
    return otgovor({ message: 'В демото това не е налично' }, 404);
  };

  /* Влизаме предварително, за да не се иска парола. */
  try {
    localStorage.setItem('pa_jwt', 'demo');
    const K = 'pravoAcademy_v3';
    let s = {};
    try { s = JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { s = {}; }
    /* Имейлът е този, който сайтът признава за администратор — така от
       демото се вижда и админският панел. Тук няма истински права:
       всичко е записан отговор, нищо не се променя никъде. */
    s.user = { email: 'nikolaid.business@gmail.com', name: 'Николай' };
    s.purchased = ['oblp'];
    localStorage.setItem(K, JSON.stringify(s));
  } catch (e) { /* браузър без хранилище — сайтът пак ще тръгне */ }
})();
</script>
'''

plast = plast.replace('__DANNI__', json.dumps(d, ensure_ascii=False))

# Пластът трябва да е ПРЕДИ модулите, за да е готов преди първата заявка.
index = index.replace('</head>', plast + '\n</head>', 1)

# лента, че това е демо
lenta = '''
<style>
#pa-demo-lenta{
  position:fixed; left:0; right:0; bottom:0; z-index:99999;
  background:#16181d; color:#d3d7de; font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  padding:9px 16px; display:flex; gap:10px; align-items:center; justify-content:center;
  border-top:2px solid #7a1f2b;
}
#pa-demo-lenta b{color:#fff}
#pa-demo-lenta button{
  background:none; border:1px solid #3a3f4a; color:#98a0b0; border-radius:5px;
  padding:3px 9px; font-size:12px; cursor:pointer; margin-left:6px;
}
#pa-demo-lenta button:hover{color:#fff; border-color:#5a6272}
@media(max-width:640px){#pa-demo-lenta{font-size:11.5px; padding:7px 10px}}
</style>
<div id="pa-demo-lenta">
  <span><b>Демонстрация</b> — съдържанието е записано предварително и работи без интернет.
  Влязъл си като администратор. Плащания и регистрация не са активни;
  промените в админския панел не се запазват.</span>
  <button onclick="this.parentElement.remove()">скрий</button>
</div>
'''
index = index.replace('</body>', lenta + '\n</body>', 1)

io.open(IZHOD, 'w', encoding='utf-8').write(index)
print(f'готово: {os.path.getsize(IZHOD)/1024/1024:.1f} MB')
print(f'вградени: 1 JS + 1 CSS · {len(d["zapis"])} записа от API')
