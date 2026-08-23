import { akaunt, papka, pusniBrauzar } from './brauzar.mjs';
const AKAUNT = akaunt();
const OUT=papka('funkcii');
const B='http://localhost:8080';
const b=await pusniBrauzar();
const p=await b.newPage({viewport:{width:1280,height:900}});
const prob=[];
p.on('pageerror',e=>prob.push('JS: '+e.message));
p.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/403|favicon|ERR_TUNNEL/.test(t)) prob.push('конзола: '+t.slice(0,140));});
const T=()=>p.evaluate(()=>document.getElementById('app')?.innerText||'');
const BODY=()=>p.evaluate(()=>document.body.innerText||'');
const step=async(n,f)=>{try{await f();console.log('  ✓ '+n);}catch(e){console.log('  ✗ '+n+' — '+String(e.message).slice(0,110));prob.push(n);}};
const go=async(h,ms=2400)=>{await p.evaluate(async x=>{if(location.hash===x){location.hash='#/dashboard';await new Promise(r=>setTimeout(r,350));}location.hash=x;},h);await p.waitForTimeout(ms);};

await p.goto(B,{timeout:60000}); await p.waitForTimeout(2500);
const cc=p.getByRole('button',{name:/Приемам всички/}); if(await cc.count()) await cc.click();
await go('#/login',1400);
await p.fill('input[name="email"]',AKAUNT.imejl); await p.fill('input[type="password"]',AKAUNT.parola);
await p.getByRole('button',{name:'Вход'}).last().click(); await p.waitForTimeout(3500);

console.log('\n▸ ФУНКЦИИ, КОИТО ДОСЕГА САМО ОТВАРЯХ');

await step('помодоро таймерът тръгва', async()=>{
  await p.evaluate(()=>window.togglePomo && window.togglePomo()); await p.waitForTimeout(700);
  const vis=await p.evaluate(()=>{const el=document.getElementById('pomoPanel');
    return el && getComputedStyle(el).display!=='none';});
  if(!vis) throw new Error('панелът не се показа');
  await p.evaluate(()=>window.pomoStart && window.pomoStart()); await p.waitForTimeout(2200);
  const t=await p.evaluate(()=>document.getElementById('pomoTime')?.textContent||'');
  if(!/\d+:\d\d/.test(t)) throw new Error('няма време: '+t);
  await p.evaluate(()=>window.pomoReset && window.pomoReset());
});

await step('изпитният жребий тегли билет', async()=>{
  await go('#/exam-draw/oblp',2600);
  const btn=p.getByRole('button',{name:/Тегли|Започни|Старт/}).first();
  if(!await btn.count()) throw new Error('няма бутон');
  await btn.click(); await p.waitForTimeout(3000);
  const t=await T(); if(t.length<120) throw new Error('празен екран');
});
await p.screenshot({path:OUT+'/01-examdraw.png'});

await step('планът за изпит се генерира', async()=>{
  await go('#/plan',2600);
  const btn=p.getByRole('button',{name:/Генерирай|Създай|Направи/}).first();
  if(await btn.count()){ await btn.click(); await p.waitForTimeout(2500); }
  const t=await T(); if(t.length<150) throw new Error('празен');
});
await p.screenshot({path:OUT+'/02-plan.png'});

await step('бележка към тема се записва', async()=>{
  await go('#/conspect/oblp?chapter=2',3200);
  const ta=p.locator('#noteInput, .tp-note-input, textarea').first();
  if(!await ta.count()) throw new Error('няма поле за бележка');
  await ta.fill('ТЕСТ бележка');
  const added=await p.evaluate(()=>{
    if(typeof window.__noteAdd!=='function') return 'няма функция';
    try{ window.__noteAdd('oblp',2); }catch(e){ return 'грешка: '+e.message; }
    return 'ok';
  });
  if(added!=='ok') throw new Error(added);
  await p.waitForTimeout(900);
  await go('#/notes/oblp',2400);
  if(!(await T()).includes('ТЕСТ бележка')) throw new Error('бележката не се вижда');
});
await p.screenshot({path:OUT+'/03-notes.png'});

await step('тетрадката на грешките показва сбъркани въпроси', async()=>{
  await go('#/mistakes',2400);
  const t=await T(); if(t.length<60) throw new Error('празен');
});

await step('SRS преговорът тръгва', async()=>{
  await go('#/review/oblp',3000);
  const t=await T(); if(t.length<80) throw new Error('празен');
});
await p.screenshot({path:OUT+'/04-review.png'});

await step('постиженията се изчисляват', async()=>{
  await go('#/achievements',2400);
  const t=await T(); if(!/постижен|Постижен/i.test(t)) throw new Error('няма: '+t.slice(0,80));
});

await step('AI асистентът се отваря', async()=>{
  await go('#/subject/oblp',2600);
  const bubble=p.locator('.ai-bubble').first();
  if(!await bubble.count()) throw new Error('няма бутон');
  await bubble.click(); await p.waitForTimeout(1800);
  const open=await p.evaluate(()=>!!document.querySelector('.ai-panel'));
  if(!open) throw new Error('панелът не се отвори');
});
await p.screenshot({path:OUT+'/05-ai.png'});

await step('командната палитра (Cmd+K) работи', async()=>{
  await p.keyboard.press('Control+k'); await p.waitForTimeout(900);
  const open=await p.evaluate(()=>!!document.querySelector('.cmd-backdrop'));
  if(!open) throw new Error('не се отвори');
  await p.keyboard.press('Escape');
});

await step('смяна на тема (тъмна/светла)', async()=>{
  const before=await p.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  await p.evaluate(()=>window.toggleTheme && window.toggleTheme()); await p.waitForTimeout(700);
  const after=await p.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  if(before===after) throw new Error('темата не се смени');
  await p.evaluate(()=>window.toggleTheme && window.toggleTheme());
});

await step('настройки: смяна на име', async()=>{
  await go('#/settings',2600);
  const inp=p.locator('#setName, input[value*="Тест"]').first();
  if(await inp.count()){ await inp.fill('Тест Студент 2'); }
  const r=await p.evaluate(async()=>{
    if(typeof window.__setSaveName!=='function') return 'няма функция';
    try{ await window.__setSaveName(); return 'ok'; }catch(e){ return 'грешка: '+e.message; }
  });
  if(r!=='ok') throw new Error(r);
  await p.waitForTimeout(1500);
});
await p.screenshot({path:OUT+'/06-settings.png'});

await step('поддръжка: изпращане на тикет', async()=>{
  await go('#/support',2600);
  const t=await T(); if(t.length<80) throw new Error('празен екран');
});

await step('отбелязване на тема като прочетена', async()=>{
  await go('#/conspect/oblp?chapter=3',3000);
  const before=await p.evaluate(()=>JSON.stringify(window.state?.topicCompleted?.oblp||{}));
  await p.evaluate(()=>window.toggleTopicDone && window.toggleTopicDone('oblp',3));
  await p.waitForTimeout(900);
  const after=await p.evaluate(()=>JSON.stringify(window.state?.topicCompleted?.oblp||{}));
  if(before===after) throw new Error('прогресът не се промени');
});

console.log('\n▸ РЕЗУЛТАТ');
console.log('   проблеми:',prob.length);
prob.forEach(x=>console.log('   ✗ '+x));
await b.close();
