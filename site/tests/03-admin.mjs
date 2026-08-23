import { admin, papka, pusniBrauzar } from './brauzar.mjs';
const ADMIN = admin();
const OUT=papka('admin');
const B='http://localhost:8080';
const b=await pusniBrauzar();
const p=await b.newPage({viewport:{width:1400,height:1000}});
const net=[]; const prob=[];
p.on('pageerror',e=>prob.push('JS: '+e.message));
p.on('response',r=>{const u=r.url(); if(u.includes('/api/admin/')) net.push(r.request().method()+' '+r.status()+' '+u.replace(B,''));});
const T=()=>p.evaluate(()=>document.getElementById('app')?.innerText||'');
const step=async(n,f)=>{try{await f();console.log('  ✓ '+n);}catch(e){console.log('  ✗ '+n+' — '+e.message);prob.push(n+': '+e.message);}};

await p.goto(B,{timeout:60000}); await p.waitForTimeout(2500);
const cc=p.getByRole('button',{name:/Приемам всички/}); if(await cc.count()) await cc.click();
await p.evaluate(()=>{location.hash='#/login';}); await p.waitForTimeout(1200);
await p.fill('input[name="email"]',ADMIN.imejl);
await p.fill('input[type="password"]',ADMIN.parola);
await p.getByRole('button',{name:'Вход'}).last().click(); await p.waitForTimeout(3800);

await step('ролята е разпозната като админ', async()=>{
  const role=await p.evaluate(()=>window.PA_ROLE);
  if(role!=='admin') throw new Error('роля: '+role);
});

await step('админ панелът се отваря', async()=>{
  await p.evaluate(()=>{location.hash='#/admin';}); await p.waitForTimeout(3000);
  const t=await T(); if(t.length<100) throw new Error('празен');
});
await p.screenshot({path:OUT+'/01-admin.png'});

await step('разделът „Съдържание" показва материала от базата', async()=>{
  await p.evaluate(()=>{location.hash='#/admin?tab=content';}); await p.waitForTimeout(3200);
  const t=await T();
  if(!/Съдържание/i.test(t)) throw new Error('няма раздел: '+t.slice(0,100));
});
await p.screenshot({path:OUT+'/02-content.png'});
const t2=await T();
const rows=await p.evaluate(()=>document.querySelectorAll('.ed-row, tbody tr').length);
console.log('    редове в таблицата:',rows);
const label=await p.evaluate(()=>{const s=document.querySelector('select');return s?s.options[s.selectedIndex].text:'(няма)';});
console.log('    избрана дисциплина:',label);
console.log('  заявки към админ API:', net.length?net:'(няма)');
console.log('  проблеми:', prob.length?prob:'няма');
await b.close();
