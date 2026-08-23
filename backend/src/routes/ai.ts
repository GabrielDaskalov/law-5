/**
 * AI Асистент — истински отговори за AI панела на сайта.
 *
 *   POST /api/ai/ask { question, context?, subject? }
 *
 * Как работи:
 *   - Сайтът праща въпроса + откъси от конспекта (context) — той знае
 *     коя дисциплина гледа потребителят и праща релевантните теми.
 *   - Backend-ът пази API ключа (никога не отива в браузъра!) и пита
 *     Anthropic API, като инструктира модела да отговаря по конспекта.
 *   - Дневен лимит: 30 въпроса за логнати, 5 за гости (по IP).
 *   - AI_STUB=1 в .env → демо отговори без истински API (за разработка).
 */

import { Router, Request } from 'express';
import { asyncHandler } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { db } from '../db';

const router = Router();

const DAILY_LIMIT_USER = parseInt(process.env.AI_DAILY_LIMIT_USER || '30', 10);
const DAILY_LIMIT_GUEST = parseInt(process.env.AI_DAILY_LIMIT_GUEST || '5', 10);
const MAX_QUESTION = 1000;
const MAX_CONTEXT = 12000;
const MAX_HISTORY = 6;          // последните N реплики от разговора
const MAX_HISTORY_ITEM = 800;   // символа на реплика

/** Опционална автентикация: ако има токен — взимаме потребителя, ако не — гост */
async function identify(req: Request): Promise<{ identity: string; isUser: boolean }> {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = await AuthService.validateToken(header.slice(7));
      return { identity: 'user:' + payload.user_id, isUser: true };
    } catch {
      /* невалиден токен → третираме като гост */
    }
  }
  // ПОПРАВКА: суровият X-Forwarded-For може да се спуфне при директен достъп;
  // req.ip уважава trust proxy и не се лъже
  return { identity: 'ip:' + (req.ip || 'unknown'), isUser: false };
}

/** Брои и проверява дневния лимит. Връща null ако е ОК, иначе съобщение. */
async function checkLimit(identity: string, limit: number): Promise<string | null> {
  const row = await db.one<{ count: number }>(
    `INSERT INTO ai_usage (identity, day, count) VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (identity, day) DO UPDATE SET count = ai_usage.count + 1
     RETURNING count`,
    [identity]
  );
  if (row.count > limit) {
    return `Достигнат е дневният лимит от ${limit} AI въпроса. Опитай отново утре.`;
  }
  return null;
}

type HistoryMsg = { role: 'user' | 'assistant'; content: string };

/** Валидира и подрязва историята на разговора от клиента */
function sanitizeHistory(raw: unknown): HistoryMsg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_ITEM) }));
}

/** Вика Anthropic API (или стаб в демо режим) */
async function askModel(question: string, context: string, subject: string, history: HistoryMsg[]): Promise<string> {
  if (process.env.AI_STUB === '1') {
    return `[ДЕМО РЕЖИМ] Въпросът ти беше: „${question.slice(0, 80)}". ` +
      `Когато в .env се добави ANTHROPIC_API_KEY, тук ще получиш истински отговор, ` +
      `базиран на конспекта${subject ? ` по ${subject}` : ''}.`;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('AI не е конфигуриран — добави ANTHROPIC_API_KEY в .env (или AI_STUB=1 за демо)'), { status: 503 });
  }

  const system = [
    'Ти си учебен асистент на „Law+" — платформа за подготовка на студенти по право в България.',
    'Отговаряй на български, ясно и структурирано, с примери където помага.',
    'Ако е предоставен ОТКЪС ОТ КОНСПЕКТА — основавай отговора си предимно на него и се придържай към терминологията му.',
    'Ако въпросът излиза извън конспекта, кажи го изрично и отговори с общи правни знания, като напомниш, че за изпита водещ е конспектът.',
    'Не давай правни съвети за реални казуси на потребителя — ти си помощник за учене.',
    'Бъди кратък: до ~250 думи, освен ако въпросът не изисква повече.',
  ].join(' ');

  const userContent = context
    ? `ОТКЪС ОТ КОНСПЕКТА${subject ? ` (${subject})` : ''}:\n"""\n${context}\n"""\n\nВЪПРОС: ${question}`
    : `ВЪПРОС: ${question}`;

  // Историята на разговора → контекст за последователни въпроси
  // (Anthropic изисква редуване; подсигуряваме, че почва с user и свършва преди новия въпрос)
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let expect: 'user' | 'assistant' = 'user';
  for (const m of history) {
    if (m.role === expect) {
      messages.push(m);
      expect = expect === 'user' ? 'assistant' : 'user';
    }
  }
  if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
  messages.push({ role: 'user', content: userContent });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system,
      messages,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error('[ai] Anthropic API error:', resp.status, errText.slice(0, 300));
    throw Object.assign(new Error('AI услугата е временно недостъпна. Опитай пак след малко.'), { status: 502 });
  }

  const data: any = await resp.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return text || 'Не получих отговор — опитай да преформулираш въпроса.';
}

/** POST /api/ai/ask */
router.post(
  '/ai/ask',
  asyncHandler(async (req, res) => {
    const { question, context, subject, history } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid Question', message: 'Въпросът е задължителен' });
    }
    if (question.length > MAX_QUESTION) {
      return res.status(400).json({ success: false, error: 'Question Too Long', message: `Въпросът е над ${MAX_QUESTION} символа` });
    }

    const { identity, isUser } = await identify(req);
    const limitMsg = await checkLimit(identity, isUser ? DAILY_LIMIT_USER : DAILY_LIMIT_GUEST);
    if (limitMsg) {
      return res.status(429).json({ success: false, error: 'Rate Limited', message: limitMsg });
    }

    try {
      const answer = await askModel(
        question.trim(),
        typeof context === 'string' ? context.slice(0, MAX_CONTEXT) : '',
        typeof subject === 'string' ? subject.slice(0, 100) : '',
        sanitizeHistory(history)
      );
      res.json({ success: true, data: { answer }, timestamp: new Date().toISOString() });
    } catch (err: any) {
      res.status(err.status || 500).json({
        success: false,
        error: 'AI Error',
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

export default router;
