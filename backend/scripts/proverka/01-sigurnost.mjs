/**
 * Проверка на поправките по сигурността — срещу работещия локален сървър.
 * Всеки тест описва какво се опитва да направи нападателят и какво трябва да стане.
 */
import { paket, zaqvka, brojach, sarvaratRaboti, iskaPredpostavki } from './obshto.mjs';

iskaPredpostavki();

const jwt = paket('jsonwebtoken');
const b = brojach();
const rezultat = (dobre, ime, detajl) => (dobre ? b.da(ime, detajl) : b.ne(ime, detajl));

if (!(await sarvaratRaboti())) {
  console.error('\nСървърът не отговаря. Пусни го с `npm run dev` в backend/ и опитай пак.\n');
  process.exit(2);
}

console.log('\n═══ 1. Фалшив токен вече не дава нова квота (rateKey) ═══');
{
  // Нападателят сглобява токен с произволен подпис — jwt.decode го приемаше.
  const falshiv = jwt.sign({ user_id: 'izmislen-' + Date.now() }, 'greshna-tajna');
  const r = await zaqvka('/api/user/profile', { headers: { Authorization: 'Bearer ' + falshiv } });
  rezultat(r.status === 401, 'фалшив подпис се отхвърля от authenticate', 'статус ' + r.status);
}

console.log('\n═══ 2. Съобщенията за грешка не издават вътрешности ═══');
{
  const r = await zaqvka('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nqma@nikoga.bg', password: 'greshna' }),
  });
  const t = JSON.stringify(r.telo);
  const izticha = /relation|column|constraint|SELECT|pg_|syntax error/i.test(t);
  rezultat(!izticha, 'няма SQL подробности в отговора', r.telo.message || '');
}

console.log('\n═══ 3. Еднакво съобщение за несъществуващ и за грешна парола ═══');
{
  const a = await zaqvka('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'nqma@nikoga.bg', password: 'x1234567' }) });
  const b = await zaqvka('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@pravo-academy.bg', password: 'greshnaparola1' }) });
  rezultat(a.telo.message === b.telo.message, 'еднакво съобщение', `„${a.telo.message}“`);
}

console.log('\n═══ 4. Времето на отговор не издава дали имейлът съществува ═══');
{
  // ВАЖНО: ограничителят връща 429 мигновено и разваля измерването.
  // Затова броим само отговорите, които наистина са минали през bcrypt.
  async function izmeri(mail) {
    const t = [];
    for (let i = 0; i < 5; i++) {
      const s = Date.now();
      const r = await zaqvka('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: mail, password: 'greshnaparola1' }) });
      if (r.status !== 429) t.push(Date.now() - s);
    }
    return t.length ? t.sort((x, y) => x - y)[Math.floor(t.length / 2)] : null;
  }
  const nqma = await izmeri('nqma@nikoga.bg');
  const ima = await izmeri('admin@pravo-academy.bg');
  if (nqma === null || ima === null) {
    console.log('  ⏭️  не може да се измери през HTTP — ограничителят вече е задействан');
    console.log('      (изравняването се проверява отделно — виж LOGIN_MIN_MS в authService.ts)');
  } else {
    const otn = Math.max(nqma, ima) / Math.max(1, Math.min(nqma, ima));
    rezultat(otn < 1.5, 'няма разлика във времето', `несъществуващ ${nqma}ms · съществуващ ${ima}ms (${otn.toFixed(2)}×)`);
  }
}

console.log('\n═══ 5. Заглавки за сигурност от helmet ═══');
{
  const r = await zaqvka('/health');
  const iskani = ['x-content-type-options', 'strict-transport-security', 'content-security-policy', 'x-frame-options'];
  for (const h of iskani) {
    rezultat(!!r.headers.get(h), `заглавка ${h}`, (r.headers.get(h) || '').slice(0, 55));
  }
}

console.log('\n═══ 6. Лимит на опитите за вход ═══');
{
  let blokiran = 0;
  for (let i = 0; i < 14; i++) {
    const r = await zaqvka('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: `probа${i}@x.bg`, password: 'greshna123' }) });
    if (r.status === 429) blokiran++;
  }
  rezultat(blokiran > 0, 'налучкването се спира', `${blokiran} от 14 заявки блокирани`);
}

console.log('\n═══ 7. Админските маршрути искат админ ═══');
{
  const r = await zaqvka('/api/admin/content/quiz?subject=oblp');
  rezultat(r.status === 401 || r.status === 403, 'без токен — отказ', 'статус ' + r.status);
}

console.log('\n═══ 8. SQL инжекция в параметрите ═══');
{
  const tovar = ["' OR '1'='1", "'; DROP TABLE users; --", "1' UNION SELECT null,null,null--"];
  let vsichki = true;
  for (const t of tovar) {
    const r = await zaqvka('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: t, password: t }) });
    const zle = /relation|syntax|pg_|SELECT/i.test(JSON.stringify(r.telo));
    if (zle || r.status === 500) vsichki = false;
  }
  rezultat(vsichki, 'параметризираните заявки удържат', tovar.length + ' проби, нула 500-ки');
}

process.exit(b.kraj('СИГУРНОСТ') > 0 ? 1 : 0);
