import { mkdirSync } from 'node:fs';
import { pusniBrauzar } from './brauzar.mjs';
const [,,url,outDir] = process.argv;
mkdirSync(outDir,{recursive:true});
const ROUTES=[['#/','home'],['#/packages','packages'],['#/pricing','pricing'],['#/about','about'],
  ['#/contact','contact'],['#/faq','faq'],['#/login','login'],['#/register','register'],
  ['#/terms','terms'],['#/privacy','privacy']];
const b=await pusniBrauzar();
const p=await b.newPage({viewport:{width:1280,height:900}});
await p.goto(url,{timeout:180000}); await p.waitForTimeout(4000);
const cc=p.getByRole('button',{name:/Приемам всички/}); if(await cc.count()) await cc.click();
await p.waitForTimeout(600);
for (const [h,n] of ROUTES){
  await p.evaluate(x=>{location.hash=x;},h);
  await p.waitForTimeout(2000);
  await p.screenshot({path:`${outDir}/${n}.png`});
}
await b.close();
