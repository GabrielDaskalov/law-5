import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { SITE, naidiBrauzar, paketNaSajta } from './obshto.mjs';

let chromium;
try { ({ chromium } = await paketNaSajta('playwright')); }
catch { console.error('\nЛипсва playwright. Инсталирай го: cd site && npm ci\n'); process.exit(2); }
const KOREN = join(SITE, 'dist');
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const s=createServer((q,r)=>{const p=normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/,'');
 let f=join(KOREN,p); if(!existsSync(f)||p==='/')f=join(KOREN,'index.html');
 try{r.writeHead(200,{'Content-Type':T[extname(f)]||'application/octet-stream'});r.end(readFileSync(f));}catch{r.writeHead(404);r.end();}});
if (!existsSync(join(KOREN, 'index.html'))) {
  console.error('\nНяма site/dist — сглоби сайта първо: cd site && npm ci && npm run build\n');
  process.exit(2);
}
await new Promise(r=>s.listen(8097,r));
const izp = naidiBrauzar();
const b = await chromium.launch(izp ? { executablePath: izp } : {});
const STRANICI=['/','#/login','#/register','#/dashboard','#/search','#/settings','#/forgot-password','#/reset-password?token=abc123','#/admin'];
let ok=0,lo=0;
console.log('\n═══ Димен тест: страниците се зареждат без грешки ═══\n');
for(const st of STRANICI){
  const p=await b.newPage(); const gr=[];
  p.on('pageerror',e=>gr.push(e.message));
  try{
    await p.goto('http://localhost:8097/'+st.replace(/^\//,''),{waitUntil:'domcontentloaded',timeout:20000});
    await p.waitForTimeout(800);
    const ima=await p.evaluate(()=>{const a=document.getElementById('app');return !!(a&&a.innerHTML.trim().length>60);});
    const kriti=gr.filter(g=>!/ERR_TUNNEL|ERR_INTERNET|Failed to fetch|NetworkError|net::/i.test(g));
    if(ima&&!kriti.length){ok++;console.log(`  ✅ ${st.padEnd(34)} нарисувана`);}
    else{lo++;console.log(`  ❌ ${st.padEnd(34)} ${!ima?'празна страница':'грешка: '+kriti[0].slice(0,70)}`);}
  }catch(e){lo++;console.log(`  ❌ ${st.padEnd(34)} ${e.message.split('\n')[0].slice(0,60)}`);}
  await p.close();
}
await b.close(); s.close();
console.log('\n'+'─'.repeat(60));
console.log(`СТРАНИЦИ: ${ok} минали · ${lo} паднали`);
process.exit(lo>0?1:0);
