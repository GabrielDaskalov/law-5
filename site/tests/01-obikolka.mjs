import { akaunt, papka, pusniBrauzar } from './brauzar.mjs';
const AKAUNT = akaunt();
const OUT=papka('obikolka');
const BASE='http://localhost:8080';
const b=await pusniBrauzar();
const p=await b.newPage({viewport:{width:1280,height:900}});
const problems=[];
p.on('pageerror',e=>problems.push('JS: '+e.message));
p.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(!/favicon|ERR_TUNNEL|403 \(Forbidden\)/.test(t)) problems.push('конзола: '+t.slice(0,160)); }});
const net=[];
p.on('response',r=>{ const u=r.url(); if(u.includes('/api/')) net.push(r.status()+' '+u.replace(BASE,'')); });

const step=async(name,fn)=>{ try{ await fn(); console.log('  ✓ '+name); }catch(e){ console.log('  ✗ '+name+' — '+e.message); problems.push(name+': '+e.message);} };
const go=async(h,ms=2200)=>{ await p.evaluate(x=>{location.hash=x;},h); await p.waitForTimeout(ms); };
const shot=n=>p.screenshot({path:`${OUT}/${n}.png`});
const text=()=>p.evaluate(()=>document.getElementById('app')?.innerText||'');

console.log('\n▸ ЗАРЕЖДАНЕ');
await p.goto(BASE,{timeout:60000}); await p.waitForTimeout(2500);
const cc=p.getByRole('button',{name:/Приемам всички/}); if(await cc.count()) await cc.click();
await step('началната страница се зарежда', async()=>{
  const t=await text(); if(!t.includes('Изпитът')) throw new Error('липсва заглавието');
});
await shot('01-landing');

console.log('\n▸ КАТАЛОГ ОТ СЪРВЪРА');
await step('пакетите показват дисциплини от базата', async()=>{
  await go('#/packages');
  const t=await text();
  if(!t.includes('Облигационно право')) throw new Error('няма Облигационно право');
  if(!t.includes('Наказателно право')) throw new Error('няма Наказателно право');
});
await shot('02-packages');

console.log('\n▸ ЗАКЛЮЧЕНО БЕЗ ВХОД');
await step('тестът иска вход/покупка', async()=>{
  await go('#/quiz/oblp',2600);
  const t=await text();
  if(/^\s*1\s*\/\s*\d+/m.test(t)) throw new Error('ДУПКА: тестът се вижда без вход!');
});
await shot('03-locked-anon');

console.log('\n▸ ВХОД');
await step('вход с истински акаунт', async()=>{
  await go('#/login');
  await p.fill('input[name="email"]',AKAUNT.imejl);
  await p.fill('input[type="password"]',AKAUNT.parola);
  await p.getByRole('button',{name:'Вход'}).last().click();
  await p.waitForTimeout(3500);
  const jwt=await p.evaluate(()=>localStorage.getItem('pa_jwt'));
  if(!jwt) throw new Error('няма JWT — входът не мина през сървъра');
});
await shot('04-dashboard');

console.log('\n▸ КУПЕН ПРЕДМЕТ (oblp)');
await step('страницата на предмета показва темите от базата', async()=>{
  await go('#/subject/oblp',3000);
  const t=await text();
  if(!/тем/i.test(t)) throw new Error('няма теми');
  if(t.length<200) throw new Error('екранът е празен');
});
await shot('05-subject');

await step('конспектът се зарежда от сървъра', async()=>{
  await go('#/conspect/oblp?t=1',3200);
  const t=await text();
  if(t.length<400) throw new Error('конспектът е празен ('+t.length+' знака)');
});
await shot('06-conspect');

await step('флашкартите идват от базата', async()=>{
  await go('#/flashcards/oblp',3000);
  const t=await text();
  if(t.length<80) throw new Error('няма карти');
});
await shot('07-flashcards');

await step('тестът показва въпрос', async()=>{
  await go('#/quiz/oblp',3200);
  let t=await text();
  if(/Избери теми за теста/.test(t)){
    const start=p.getByRole('button',{name:/Започни|Старт/}).first();
    if(!await start.count()) throw new Error('няма бутон за старт');
    await start.click(); await p.waitForTimeout(2600);
    t=await text();
  }
  if(!/^\s*1\s*\/\s*\d+/m.test(t)) throw new Error('няма въпрос: '+t.slice(0,150));
});
await shot('08-quiz');

console.log('\n▸ ОТГОВОРИТЕ НЕ СА В БРАУЗЪРА');
await step('въпросът не носи верния отговор', async()=>{
  const leaked=await p.evaluate(()=>{
    const html=document.documentElement.innerHTML;
    return /correct_index|correctIndex/.test(html);
  });
  if(leaked) throw new Error('ДУПКА: верният отговор е в страницата');
});
await step('проверката минава през сървъра', async()=>{
  const before=net.filter(x=>x.includes('/check')).length;
  const opt=p.locator('.quiz-option').first();
  await opt.click(); await p.waitForTimeout(2200);
  const after=net.filter(x=>x.includes('/check')).length;
  if(after<=before) throw new Error('няма заявка към /quiz/:id/check');
  const t=await text();
  if(!/Верен отговор|Грешен отговор/.test(t)) throw new Error('няма отсъда на екрана');
});
await shot('09-quiz-answered');

await step('казусите се зареждат, решението — при поискване', async()=>{
  await go('#/cases/oblp',3000);
  const t=await text();
  if(!/Казус/.test(t)) throw new Error('няма казуси');
  const btn=p.getByRole('button',{name:'Покажи решението'}).first();
  if(await btn.count()){ await btn.click(); await p.waitForTimeout(2000); }
});
await shot('10-cases');

console.log('\n▸ НЕКУПЕН ПРЕДМЕТ (nk)');
await step('чуждият предмет е заключен', async()=>{
  await go('#/quiz/nk',3000);
  const t=await text();
  if(/^\s*1\s*\/\s*\d+/m.test(t)) throw new Error('ДУПКА: некупен предмет дава тест!');
});
await shot('11-locked-nk');

console.log('\n▸ ОСТАНАЛИТЕ ЕКРАНИ');
for(const [h,n] of [['#/plan','12-plan'],['#/review/oblp','13-review'],['#/mistakes','14-mistakes'],
  ['#/settings','15-settings'],['#/support','16-support'],['#/search?q=договор','17-search'],
  ['#/faq','18-faq'],['#/pricing','19-pricing'],['#/about','20-about'],['#/streak','21-streak'],
  ['#/achievements','22-achievements'],['#/exam-draw/oblp','23-examdraw'],['#/notes/oblp','24-notes'],
  ['#/terms','25-terms'],['#/privacy','26-privacy'],['#/admin','27-admin']]){
  await step('екран '+h, async()=>{ await go(h,2400); const t=await text(); if(t.length<20) throw new Error('празен екран'); });
  await shot(n);
}

console.log('\n▸ ЗАЯВКИ КЪМ API-ТО');
const uniq=[...new Set(net)];
uniq.slice(0,25).forEach(x=>console.log('   '+x));
const bad=uniq.filter(x=>/^(4\d\d|5\d\d)/.test(x) && !/403/.test(x));
console.log('\n▸ РЕЗУЛТАТ');
console.log('   заявки:',net.length,'| уникални:',uniq.length,'| неочаквани грешки:',bad.length);
if(bad.length) bad.forEach(x=>console.log('   ✗ '+x));
console.log('   проблеми:',problems.length);
problems.slice(0,15).forEach(x=>console.log('   ✗ '+x));
await b.close();
