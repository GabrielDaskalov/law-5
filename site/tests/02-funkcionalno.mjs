import { akaunt, papka, pusniBrauzar } from './brauzar.mjs';
const AKAUNT = akaunt();
const OUT=papka('funkcionalno');
const B='http://localhost:8080';
const b=await pusniBrauzar();
const p=await b.newPage({viewport:{width:1280,height:900}});
const prob=[]; const net=[];
p.on('pageerror',e=>prob.push('JS: '+e.message));
p.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/favicon|403 \(Forbidden\)|ERR_TUNNEL/.test(t)) prob.push('конзола: '+t.slice(0,150));});
p.on('response',r=>{const u=r.url(); if(u.includes('/api/')) net.push(r.status()+' '+u.replace(B,''));});
const T=()=>p.evaluate(()=>document.getElementById('app')?.innerText||'');
const step=async(n,f)=>{try{await f();console.log('  ✓ '+n);}catch(e){console.log('  ✗ '+n+' — '+e.message);prob.push(n+': '+e.message);}};
const go=async(h,ms=2400)=>{
  await p.evaluate(async(x)=>{ if(location.hash===x){ location.hash='#/dashboard'; await new Promise(r=>setTimeout(r,400)); } location.hash=x; },h);
  await p.waitForTimeout(ms);
};

await p.goto(B,{timeout:60000}); await p.waitForTimeout(2200);
const cc=p.getByRole('button',{name:/Приемам всички/}); if(await cc.count()) await cc.click();
await go('#/login',1200);
await p.fill('input[name="email"]',AKAUNT.imejl); await p.fill('input[type="password"]',AKAUNT.parola);
await p.getByRole('button',{name:'Вход'}).last().click(); await p.waitForTimeout(3500);

console.log('\n▸ ТЕСТ ПО ИЗБРАНА ЗАДНА ТЕМА (проверка на 100-те въпроса)');
await step('избор на тема 40 дава въпроси от нея', async()=>{
  await go('#/quiz/oblp',2800);
  const chips=p.locator('#chipRow .chip[data-idx]');
  const n=await chips.count();
  if(n<40) throw new Error('малко теми: '+n);
  await chips.nth(40).click(); await p.waitForTimeout(300);
  await p.getByRole('button',{name:/Започни тест/}).click();
  await p.waitForTimeout(3500);
  const t=await T();
  if(!/^\s*1\s*\/\s*\d+/m.test(t)) throw new Error('няма въпрос: '+t.slice(0,140));
  const perTopic=net.filter(x=>x.includes('topicId=')).length;
  if(!perTopic) throw new Error('не е поискана темата поименно');
});
await p.screenshot({path:OUT+'/01-quiz-topic40.png'});

console.log('\n▸ ЦЯЛ ТЕСТ ДО КРАЯ');
await step('10 въпроса един след друг + резултат', async()=>{
  await go('#/quiz/oblp',2800);
  await p.getByRole('button',{name:/Започни тест/}).click(); await p.waitForTimeout(3000);
  for(let i=0;i<10;i++){
    const opt=p.locator('.quiz-option').first();
    const fill=p.locator('#fillInput');
    if(await opt.count()){ await opt.click(); }
    else if(await fill.count()){ await fill.fill('нещо'); await p.locator('#fillCheck').click(); }
    else break;
    await p.waitForTimeout(1400);
    const next=p.locator('#nextQ');
    if(await next.count()) { await next.click(); await p.waitForTimeout(900); }
  }
  const t=await T();
  if(!/резултат|Резултат|точки|верни/i.test(t)) throw new Error('няма резултат накрая: '+t.slice(0,160));
});
await p.screenshot({path:OUT+'/02-quiz-result.png'});

console.log('\n▸ ТЪРСЕНЕ');
await step('търсене намира резултати', async()=>{
  await go('#/search?q=неустойка',4000);
  const t=await T();
  if(!/Всичко \(\d+\)/.test(t)) throw new Error('няма резултати: '+t.slice(0,120));
  const hits=net.filter(x=>x.includes('/content/search')).length;
  if(!hits) throw new Error('не е питан сървърът');
});
await p.screenshot({path:OUT+'/03-search.png'});

console.log('\n▸ ФЛАШКАРТИ — ОБРЪЩАНЕ И ОТГОВОР');
await step('картата се обръща и приема отговор', async()=>{
  await go('#/flashcards/oblp',3000);
  const start=p.getByRole('button',{name:/Започни|Старт|Учи/}).first();
  if(await start.count()){ await start.click(); await p.waitForTimeout(1500); }
  const card=p.locator('#fcCard');
  if(await card.count()){ await card.click(); await p.waitForTimeout(800); }
  const t=await T();
  if(t.length<50) throw new Error('празен екран');
});
await p.screenshot({path:OUT+'/04-flashcards.png'});

console.log('\n▸ ПРЕЗАРЕЖДАНЕ НА СТРАНИЦАТА (сесията остава)');
await step('след F5 потребителят е още влязъл', async()=>{
  await p.goto(B+'#/subject/oblp',{timeout:60000}); await p.waitForTimeout(3500);
  const t=await T();
  if(/Вход в акаунта/.test(t)) throw new Error('изхвърлен при презареждане');
  if(t.length<200) throw new Error('празен екран след презареждане');
});
await p.screenshot({path:OUT+'/05-after-reload.png'});

console.log('\n▸ ИЗХОД');
await step('след изход платеното е недостъпно', async()=>{
  await p.evaluate(()=>window.logout && window.logout()); await p.waitForTimeout(2000);
  await go('#/quiz/oblp',2600);
  const t=await T();
  if(/^\s*1\s*\/\s*\d+/m.test(t)) throw new Error('ДУПКА: тест след изход!');
});

console.log('\n▸ РЕЗУЛТАТ');
const bad=[...new Set(net)].filter(x=>/^(4\d\d|5\d\d)/.test(x)&&!/403/.test(x));
console.log('   заявки:',net.length,'| неочаквани:',bad.length); bad.forEach(x=>console.log('   ✗ '+x));
console.log('   проблеми:',prob.length); prob.forEach(x=>console.log('   ✗ '+x));
await b.close();
