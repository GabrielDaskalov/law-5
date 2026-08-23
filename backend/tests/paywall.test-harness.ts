/** Проверка на реалния paywall срещу истинска база. */
import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { db } from './db';
import contentRouter from './routes/content.new';
import { errorHandler } from './middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/api/content', contentRouter);
app.use(errorHandler);

const server = app.listen(4599, async () => {
  const base = 'http://localhost:4599/api/content';
  const out: string[] = [];

  const paid = await db.one(`SELECT id FROM users WHERE email='t@t.bg'`);          // купил oblp
  const stranger = await db.one(
    `INSERT INTO users (email,password_hash,name) VALUES ('n@n.bg','x','Нов')
     ON CONFLICT (email) DO UPDATE SET name='Нов' RETURNING id`);
  const tok = (id: string) => jwt.sign({ user_id: id, email: 'x', role: 'student' }, config.jwt.secret);

  const get = async (path: string, token?: string) => {
    const r = await fetch(base + path, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    return { status: r.status, body: await r.json().catch(() => null) as any };
  };

  // подготовка: първа и по-късна тема от oblp
  const t0 = await db.one(`SELECT t.id,t.position FROM topics t JOIN subjects s ON s.id=t.subject_id
                           WHERE s.code='oblp' AND t.position=0`);
  const t9 = await db.one(`SELECT t.id,t.position FROM topics t JOIN subjects s ON s.id=t.subject_id
                           WHERE s.code='oblp' AND t.position=9`);

  const a = await get(`/topics/${t0.id}/conspect`);
  out.push(`анонимен, безплатна тема 0        → ${a.status} ${a.status===200?'✓ вижда':'✗'}`);

  const b = await get(`/topics/${t9.id}/conspect`);
  out.push(`анонимен, платена тема 9          → ${b.status} ${b.status===403?'✓ блокиран':'✗ ДУПКА!'}`);

  const c = await get(`/topics/${t9.id}/conspect`, tok(stranger.id));
  out.push(`влязъл без покупка, платена тема  → ${c.status} ${c.status===403?'✓ блокиран':'✗ ДУПКА!'}`);

  const d = await get(`/topics/${t9.id}/conspect`, tok(paid.id));
  out.push(`купил oblp, платена тема          → ${d.status} ${d.status===200?'✓ вижда':'✗'}`);

  const nk = await db.one(`SELECT t.id FROM topics t JOIN subjects s ON s.id=t.subject_id
                           WHERE s.code='nk' AND t.position=9`);
  const e = await get(`/topics/${nk.id}/conspect`, tok(paid.id));
  out.push(`купил oblp, чужд предмет nk       → ${e.status} ${e.status===403?'✓ блокиран':'✗ ДУПКА!'}`);

  // въпросите не носят отговори
  const q = await get(`/quiz?subject=oblp&limit=3`, tok(paid.id));
  const leaked = JSON.stringify(q.body).match(/correct_index|correctIndex|"explanation"|"accept"/);
  out.push(`тестови въпроси изтичат ли отговор→ ${leaked ? '✗ ДА: '+leaked[0] : '✓ не'}`);

  // проверка на отговор
  const item = q.body[0];
  const full = await db.one(`SELECT correct_index FROM quiz_items WHERE id=$1`, [item.id]);
  const rGood = await fetch(`${base}/quiz/${item.id}/check`, { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok(paid.id)}`},
    body: JSON.stringify({ index: full.correct_index }) }).then(r=>r.json()) as any;
  const rBad = await fetch(`${base}/quiz/${item.id}/check`, { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok(paid.id)}`},
    body: JSON.stringify({ index: (full.correct_index+1)%4 }) }).then(r=>r.json()) as any;
  out.push(`проверка: верен→${rGood.correct} грешен→${rBad.correct}  ${rGood.correct&&!rBad.correct?'✓':'✗'}`);

  // свободен отговор (латински)
  const lat = await get(`/quiz?subject=lat&limit=1`, tok(paid.id));
  out.push(`латински без покупка              → ${lat.status} ${lat.status===403?'✓ блокиран':'✗'}`);

  // каталогът е публичен
  const cat = await get('/subjects');
  out.push(`публичен каталог                  → ${cat.status} ${Array.isArray(cat.body)?cat.body.length+' предмета ✓':'✗'}`);

  // заключените теми се виждат по заглавие, но са маркирани
  const sub = await get('/subjects/oblp');
  const lockedCount = sub.body?.topics?.filter((t:any)=>t.locked).length;
  out.push(`teми маркирани заключени          → ${lockedCount}/${sub.body?.topics?.length} ✓`);

  console.log('\n  РЕЗУЛТАТИ ОТ ПРОВЕРКАТА НА ДОСТЪПА\n  ' + '─'.repeat(52));
  out.forEach(l => console.log('  ' + l));
  console.log();

  server.close();
  await db.$pool.end();
  process.exit(out.some(l=>l.includes('✗')) ? 1 : 0);
});
