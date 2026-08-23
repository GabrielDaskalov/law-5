/**
 * Admin Routes - Content Management
 * All endpoints require admin authorization
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { db } from '../db';
import { InputValidator } from '../utils/validation';
import { ValidationError } from '../types';
import {
  aktivniSesii,
  podozritelniAkaunti,
  prekratiVsichki,
} from '../services/sessionService';
import {
  akauntiZaPregled,
  otmeniIskaneZaParola,
  signaliNaAkaunt,
  stepenkaNaAkaunt,
  PRAGOVE,
} from '../services/signalService';
import { ustrojstvaNaAkaunt } from '../services/deviceService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * Записва в одитната следа, че администратор е ЧЕЛ данни за други хора.
 *
 * Досега се следяха само промените. Но при изтичане на данни въпросът е „кой
 * какво е видял“, а четенето не оставя никаква диря само по себе си — затова
 * тези справки се записват изрично.
 */
async function zapishiSpravka(
  req: any,
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, any> = {}
): Promise<void> {
  await AuditService.logAction(
    req.user!.user_id,
    action,
    resourceType,
    resourceId,
    changes,
    req.ip || 'unknown',
    String(req.headers['user-agent'] || '')
  );
}

// Middleware to check admin role
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

// ============================================================================
// FLASHCARDS MANAGEMENT
// ============================================================================

// POST /api/admin/flashcards
router.post(
  '/flashcards',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject_id, topic_id, question, answer, difficulty } = req.body;

    // Validate
    InputValidator.validateUUID(subject_id, 'subject_id');
    if (topic_id) InputValidator.validateUUID(topic_id, 'topic_id');
    InputValidator.validateString(question, 'question', 5, 1000);
    InputValidator.validateString(answer, 'answer', 5, 5000);
    InputValidator.validateEnum(difficulty || 'medium', ['easy', 'medium', 'hard'], 'difficulty');

    const id = uuidv4();

    await db.none(
      `INSERT INTO flashcards (id, subject_id, topic_id, question, answer, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, subject_id, topic_id || null, question, answer, difficulty || 'medium']
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Flashcard created',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/admin/flashcards/bulk
router.post(
  '/flashcards/bulk',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { flashcards } = req.body;

    InputValidator.validateArray(flashcards, 'flashcards', 1);

    const createdIds: string[] = [];

    for (const fc of flashcards) {
      InputValidator.validateUUID(fc.subject_id, 'subject_id');
      InputValidator.validateString(fc.question, 'question', 5, 1000);
      InputValidator.validateString(fc.answer, 'answer', 5, 5000);

      const id = uuidv4();
      await db.none(
        `INSERT INTO flashcards (id, subject_id, topic_id, question, answer, difficulty)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, fc.subject_id, fc.topic_id || null, fc.question, fc.answer, fc.difficulty || 'medium']
      );

      createdIds.push(id);
    }

    res.status(201).json({
      success: true,
      data: { created_count: createdIds.length, ids: createdIds },
      message: `${createdIds.length} flashcards created`,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// QUIZ MANAGEMENT
// ============================================================================

// POST /api/admin/quizzes
router.post(
  '/quizzes',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject_id, title, description } = req.body;

    InputValidator.validateUUID(subject_id, 'subject_id');
    InputValidator.validateString(title, 'title', 3, 255);
    if (description) InputValidator.validateString(description, 'description', 0, 1000);

    const id = uuidv4();

    await db.none(
      `INSERT INTO quizzes (id, subject_id, title, description)
       VALUES ($1, $2, $3, $4)`,
      [id, subject_id, title, description || null]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Quiz created',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/admin/quiz-questions
router.post(
  '/quiz-questions',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation } = req.body;

    InputValidator.validateUUID(quiz_id, 'quiz_id');
    InputValidator.validateString(question, 'question', 5, 1000);
    InputValidator.validateString(option_a, 'option_a', 1, 500);
    InputValidator.validateString(option_b, 'option_b', 1, 500);
    InputValidator.validateString(option_c, 'option_c', 1, 500);
    InputValidator.validateString(option_d, 'option_d', 1, 500);
    InputValidator.validateEnum(correct_answer, ['A', 'B', 'C', 'D'], 'correct_answer');
    if (explanation) InputValidator.validateString(explanation, 'explanation', 1, 2000);

    const id = uuidv4();

    await db.none(
      `INSERT INTO quiz_questions (id, quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, quiz_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation || null]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Quiz question created',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// CONSPECT MANAGEMENT
// ============================================================================

// POST /api/admin/conspects
router.post(
  '/conspects',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject_id, title, content, toc } = req.body;

    InputValidator.validateUUID(subject_id, 'subject_id');
    InputValidator.validateString(title, 'title', 3, 255);
    InputValidator.validateString(content, 'content', 10, 100000);

    const id = uuidv4();

    await db.none(
      `INSERT INTO conspects (id, subject_id, title, content, toc)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, subject_id, title, content, JSON.stringify(toc || {})]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Conspect created',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// LECTURE MANAGEMENT
// ============================================================================

// POST /api/admin/lectures
router.post(
  '/lectures',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject_id, title, youtube_url, duration, chapters, description } = req.body;

    InputValidator.validateUUID(subject_id, 'subject_id');
    InputValidator.validateString(title, 'title', 3, 255);
    if (youtube_url) InputValidator.validateURL(youtube_url, 'youtube_url');
    if (duration) InputValidator.validateNumber(duration, 'duration', 1);

    const id = uuidv4();

    await db.none(
      `INSERT INTO lectures (id, subject_id, title, youtube_url, duration, chapters, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, subject_id, title, youtube_url || null, duration || null, JSON.stringify(chapters || []), description || null]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Lecture created',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// CASE MANAGEMENT
// ============================================================================

// POST /api/admin/cases
router.post(
  '/cases',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject_id, topic_id, title, facts, legal_question, decision, analysis, references, court, year } =
      req.body;

    InputValidator.validateUUID(subject_id, 'subject_id');
    InputValidator.validateString(title, 'title', 3, 255);
    InputValidator.validateString(facts, 'facts', 10, 10000);
    InputValidator.validateString(legal_question, 'legal_question', 5, 2000);
    InputValidator.validateString(decision, 'decision', 10, 10000);

    const id = uuidv4();

    await db.none(
      `INSERT INTO cases (id, subject_id, topic_id, title, facts, legal_question, decision, analysis, references, court, year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        subject_id,
        topic_id || null,
        title,
        facts,
        legal_question,
        decision,
        analysis || null,
        JSON.stringify(references || []),
        court || null,
        year || null,
      ]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Case created',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// EXAM CALENDAR MANAGEMENT
// ============================================================================

// POST /api/admin/exam-calendar
//
// ВНИМАНИЕ: въпреки пътя под /api/admin това НЕ е админски маршрут и
// липсващият `requireAdmin` не е пропуск. Записът отива в собствения
// календар на извикващия (`user_id = req.user!.user_id`), тоест всеки
// влязъл потребител си насрочва изпит само за себе си. Добавянето на
// `requireAdmin` тук би отнело функцията на студентите.
router.post(
  '/exam-calendar',
  authenticate,
  asyncHandler(async (req, res) => {
    const { subject_id, exam_date, exam_type } = req.body;
    const userId = req.user!.user_id;

    InputValidator.validateUUID(subject_id, 'subject_id');
    const date = InputValidator.validateFutureDate(exam_date, 'exam_date');

    const id = uuidv4();

    await db.none(
      `INSERT INTO exam_calendar (id, user_id, subject_id, exam_date, exam_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, subject_id, date, exam_type || null]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Exam scheduled',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

// PUT /api/admin/flashcards/batch
router.put(
  '/flashcards/batch',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { updates } = req.body;

    InputValidator.validateArray(updates, 'updates', 1);

    let successCount = 0;
    const errors: any[] = [];

    for (const update of updates) {
      try {
        InputValidator.validateUUID(update.id, 'id');

        const setClauses: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (update.question !== undefined) {
          InputValidator.validateString(update.question, 'question', 5, 1000);
          setClauses.push(`question = $${paramCount}`);
          values.push(update.question);
          paramCount++;
        }
        if (update.answer !== undefined) {
          InputValidator.validateString(update.answer, 'answer', 5, 5000);
          setClauses.push(`answer = $${paramCount}`);
          values.push(update.answer);
          paramCount++;
        }
        if (update.difficulty !== undefined) {
          InputValidator.validateEnum(update.difficulty, ['easy', 'medium', 'hard'], 'difficulty');
          setClauses.push(`difficulty = $${paramCount}`);
          values.push(update.difficulty);
          paramCount++;
        }
        if (update.topic_id !== undefined) {
          if (update.topic_id) InputValidator.validateUUID(update.topic_id, 'topic_id');
          setClauses.push(`topic_id = $${paramCount}`);
          values.push(update.topic_id || null);
          paramCount++;
        }

        if (setClauses.length === 0) {
          errors.push({ id: update.id, error: 'No fields to update' });
          continue;
        }

        values.push(update.id);

        await db.none(
          `UPDATE flashcards SET ${setClauses.join(', ')} WHERE id = $${paramCount}`,
          values
        );

        successCount++;
      } catch (error: any) {
        errors.push({ id: update.id, error: error.message });
      }
    }

    res.json({
      success: true,
      data: {
        updated_count: successCount,
        errors: errors.length > 0 ? errors : undefined,
      },
      message: `${successCount}/${updates.length} flashcards updated`,
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/admin/flashcards/batch
router.delete(
  '/flashcards/batch',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    InputValidator.validateArray(ids, 'ids', 1);

    for (const id of ids) {
      InputValidator.validateUUID(id, 'id');
    }

    const placeholders = ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');

    const result = await db.result(
      `DELETE FROM flashcards WHERE id IN (${placeholders})`,
      ids
    );

    res.json({
      success: true,
      data: {
        deleted_count: result.rowCount,
      },
      message: `${result.rowCount} flashcards deleted`,
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/admin/quizzes/batch
router.delete(
  '/quizzes/batch',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    InputValidator.validateArray(ids, 'ids', 1);

    for (const id of ids) {
      InputValidator.validateUUID(id, 'id');
    }

    const placeholders = ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');

    const result = await db.result(
      `DELETE FROM quizzes WHERE id IN (${placeholders})`,
      ids
    );

    res.json({
      success: true,
      data: {
        deleted_count: result.rowCount,
      },
      message: `${result.rowCount} quizzes deleted`,
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/admin/cases/batch
router.delete(
  '/cases/batch',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    InputValidator.validateArray(ids, 'ids', 1);

    for (const id of ids) {
      InputValidator.validateUUID(id, 'id');
    }

    const placeholders = ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');

    const result = await db.result(
      `DELETE FROM cases WHERE id IN (${placeholders})`,
      ids
    );

    res.json({
      success: true,
      data: {
        deleted_count: result.rowCount,
      },
      message: `${result.rowCount} cases deleted`,
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/admin/lectures/batch
router.delete(
  '/lectures/batch',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    InputValidator.validateArray(ids, 'ids', 1);

    for (const id of ids) {
      InputValidator.validateUUID(id, 'id');
    }

    const placeholders = ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');

    const result = await db.result(
      `DELETE FROM lectures WHERE id IN (${placeholders})`,
      ids
    );

    res.json({
      success: true,
      data: {
        deleted_count: result.rowCount,
      },
      message: `${result.rowCount} lectures deleted`,
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/admin/content/batch/difficulty - Bulk update difficulty for flashcards
router.put(
  '/content/batch/difficulty',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { flashcard_ids, difficulty } = req.body;

    InputValidator.validateArray(flashcard_ids, 'flashcard_ids', 1);
    InputValidator.validateEnum(difficulty, ['easy', 'medium', 'hard'], 'difficulty');

    for (const id of flashcard_ids) {
      InputValidator.validateUUID(id, 'id');
    }

    const placeholders = flashcard_ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');

    const result = await db.result(
      `UPDATE flashcards SET difficulty = $${flashcard_ids.length + 1} WHERE id IN (${placeholders})`,
      [...flashcard_ids, difficulty]
    );

    res.json({
      success: true,
      data: {
        updated_count: result.rowCount,
        difficulty: difficulty,
      },
      message: `${result.rowCount} flashcards updated to ${difficulty}`,
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/admin/content/batch/subject - Move content to different subject
router.put(
  '/content/batch/subject',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { flashcard_ids, subject_id } = req.body;

    InputValidator.validateArray(flashcard_ids, 'flashcard_ids', 1);
    InputValidator.validateUUID(subject_id, 'subject_id');

    for (const id of flashcard_ids) {
      InputValidator.validateUUID(id, 'id');
    }

    const placeholders = flashcard_ids.map((_: unknown, i: number) => `$${i + 1}`).join(',');

    const result = await db.result(
      `UPDATE flashcards SET subject_id = $${flashcard_ids.length + 1} WHERE id IN (${placeholders})`,
      [...flashcard_ids, subject_id]
    );

    res.json({
      success: true,
      data: {
        updated_count: result.rowCount,
        subject_id: subject_id,
      },
      message: `${result.rowCount} flashcards moved to subject ${subject_id}`,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// USERS
// ============================================================================

// GET /api/admin/users — списък с потребителите за админ панела.
// Сайтът го вика от таб „Потребители" (44-page.js), но маршрутът липсваше и
// заявката тихо падаше с 404 в catch блок, озаглавен „демо режим". Резултат:
// панелът показваше само локалните акаунти от браузъра и изглеждаше празен.
router.get(
  '/users',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    const tarsene = String(req.query.q || '').trim();

    // Четенето на имейлите на всички потребители е точно от нещата, които
    // трябва да оставят следа.
    await zapishiSpravka(req, 'VIEW_ALL_USERS', 'users', 'list');

    const uslovie = tarsene ? 'WHERE lower(u.email) LIKE $3 OR lower(u.name) LIKE $3' : '';
    const parametri: any[] = [limit, offset];
    if (tarsene) parametri.push('%' + tarsene.toLowerCase() + '%');

    const users = await db.manyOrNone<any>(
      `SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login,
              (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id) AS purchases,
              (SELECT COUNT(*) FROM progress pr WHERE pr.user_id = u.id AND pr.status = 'completed') AS completed
         FROM users u
         ${uslovie}
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2`,
      parametri,
    );

    const total = await db.one<any>(
      tarsene
        ? 'SELECT COUNT(*) AS count FROM users u WHERE lower(u.email) LIKE $1 OR lower(u.name) LIKE $1'
        : 'SELECT COUNT(*) AS count FROM users',
      tarsene ? ['%' + tarsene.toLowerCase() + '%'] : [],
    );

    res.json({
      success: true,
      data: { users, total: parseInt(total.count, 10), limit, offset },
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// STATISTICS & REPORTS
// ============================================================================

// GET /api/admin/statistics
router.get(
  '/statistics',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Обобщение върху цялата база (брой потребители, активност, резултати) —
    // не са поименни данни, но са пълна картина на платформата и достъпът до
    // тях се вижда в одита.
    await zapishiSpravka(req, 'VIEW_PLATFORM_STATISTICS', 'statistics', 'platform');

    const totalUsers = await db.one<any>('SELECT COUNT(*) as count FROM users');
    const totalSubjects = await db.one<any>('SELECT COUNT(*) as count FROM subjects');
    const totalFlashcards = await db.one<any>('SELECT COUNT(*) as count FROM flashcards');
    const totalQuizzes = await db.one<any>('SELECT COUNT(*) as count FROM quizzes');
    const totalCases = await db.one<any>('SELECT COUNT(*) as count FROM cases');

    const avgQuizScore = await db.one<any>('SELECT AVG(score) as avg FROM quiz_results');
    const activeUsers = await db.one<any>(
      'SELECT COUNT(DISTINCT user_id) as count FROM progress WHERE completed_at > NOW() - INTERVAL \'7 days\''
    );

    res.json({
      success: true,
      data: {
        users: {
          total: parseInt(totalUsers.count),
          active_this_week: parseInt(activeUsers.count),
        },
        content: {
          subjects: parseInt(totalSubjects.count),
          flashcards: parseInt(totalFlashcards.count),
          quizzes: parseInt(totalQuizzes.count),
          cases: parseInt(totalCases.count),
        },
        performance: {
          average_quiz_score: Math.round(parseFloat(avgQuizScore.avg) || 0),
        },
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// HEALTH & SALES (за админ панела на сайта)
// ============================================================================

// GET /api/admin/client-errors — последните грешки от браузърите на потребителите
router.get(
  '/client-errors',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Докладите от браузъра носят адреси на страници и user-agent, тоест
    // следа от поведението на конкретни хора — четенето им се записва.
    await zapishiSpravka(req, 'VIEW_CLIENT_ERRORS', 'client_errors', 'last_50', { limit: 50 });

    const rows = await db.query<any>(
      `SELECT message, source, url, user_agent, created_at
       FROM client_errors ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  })
);

// GET /api/admin/health — състояние на системата с един поглед
router.get(
  '/health',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    let dbOk = false;
    try { await db.one('SELECT 1 AS ok'); dbOk = true; } catch { /* db down */ }

    let lastWebhook: string | null = null;
    try {
      const row = await db.oneOrNone<{ created_at: string }>(
        'SELECT created_at FROM stripe_webhooks_log ORDER BY created_at DESC LIMIT 1'
      );
      lastWebhook = row?.created_at || null;
    } catch { /* таблицата може да липсва */ }

    res.json({
      success: true,
      data: {
        db: dbOk,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        smtp: !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
        ai: process.env.AI_STUB === '1' ? 'stub' : process.env.ANTHROPIC_API_KEY ? 'real' : 'off',
        last_webhook: lastWebhook,
        uptime: process.uptime(),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/admin/sales — обобщение на продажбите
router.get(
  '/sales',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Данни за плащанията на клиентите — финансова информация, чийто прочит
    // трябва да може да се проследи до конкретен администратор.
    await zapishiSpravka(req, 'VIEW_SALES_SUMMARY', 'purchases', 'summary');

    // Колоната е amount DECIMAL(10,2) — в евро
    const totals = await db.one<any>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS eur FROM purchases WHERE status = 'completed'`
    );
    const last30 = await db.one<any>(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS eur FROM purchases
       WHERE status = 'completed' AND created_at > NOW() - INTERVAL '30 days'`
    );
    const byPackage = await db.query<any>(
      `SELECT package_id, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS eur
       FROM purchases WHERE status = 'completed'
       GROUP BY package_id ORDER BY eur DESC LIMIT 30`
    );

    res.json({
      success: true,
      data: {
        total_purchases: parseInt(totals.cnt),
        total_revenue_eur: parseFloat(totals.eur),
        purchases_30d: parseInt(last30.cnt),
        revenue_30d_eur: parseFloat(last30.eur),
        by_package: byPackage.map((r: any) => ({ package_id: r.package_id, cnt: parseInt(r.cnt), eur: parseFloat(r.eur) })),
      },
      timestamp: new Date().toISOString(),
    });
  })
);


/* ==========================================================================
   УСТРОЙСТВА И СПОДЕЛЕНИ АКАУНТИ

   Ограничението за брой сесии спира едновременното ползване, но не показва
   кой го е опитвал. Тези три справки показват: кои акаунти обикалят твърде
   много устройства, какво има отворено даден акаунт в момента, и лост да
   бъде изхвърлен отвсякъде.

   Нарочно НЯМА автоматично наказание. Двадесет устройства за месец значи
   или споделен достъп, или открадната парола — разликата се вижда само от
   човек, а автоматичното заключване наказва еднакво и жертвата, и виновния.
   ========================================================================== */

// GET /api/admin/sessions/podozritelni?prag=6&dni=30
router.get(
  '/sessions/podozritelni',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const prag = Math.min(50, Math.max(2, parseInt(String(req.query.prag || '6'), 10) || 6));
    const dni = Math.min(365, Math.max(1, parseInt(String(req.query.dni || '30'), 10) || 30));

    const redove = await podozritelniAkaunti(prag, dni);
    await zapishiSpravka(req, 'view_suspicious_sessions', 'sessions', 'all', { prag, dni });

    res.json({
      success: true,
      data: redove.map((r) => ({
        user_id: r.user_id,
        email: r.email,
        name: r.name,
        ustrojstva: Number(r.ustrojstva),
        mrezhi: Number(r.mrezhi),
        vhodove: Number(r.vhodove),
      })),
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/admin/users/:id/sessions
router.get(
  '/users/:id/sessions',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на потребител');

    const sesii = await aktivniSesii(id);
    await zapishiSpravka(req, 'view_user_sessions', 'user', id);

    res.json({ success: true, data: sesii, timestamp: new Date().toISOString() });
  })
);

// POST /api/admin/users/:id/sessions/prekrati — изхвърля акаунта отвсякъде
router.post(
  '/users/:id/sessions/prekrati',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на потребител');

    const broj = await prekratiVsichki(id, 'administrator');
    // Вдига се и версията на токените: сесиите падат, но токен без номер на
    // сесия (издаден преди промяната) не се хваща от тях.
    await db.none('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [id]);
    await zapishiSpravka(req, 'revoke_user_sessions', 'user', id, { prekrateni: broj });

    res.json({
      success: true,
      data: { prekrateni: broj },
      message: 'Всички устройства на този акаунт бяха изключени.',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/admin/users/:id/max-sessions — вдига лимита за конкретен акаунт
router.put(
  '/users/:id/max-sessions',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на потребител');

    const n = parseInt(String(req.body?.max_sessions), 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      throw new ValidationError('Броят устройства трябва да е между 1 и 10');
    }

    await db.none('UPDATE users SET max_sessions = $2 WHERE id = $1', [id, n]);
    await zapishiSpravka(req, 'set_max_sessions', 'user', id, { max_sessions: n });

    res.json({
      success: true,
      data: { max_sessions: n },
      message: `Този акаунт вече може да ползва ${n} устройства едновременно.`,
      timestamp: new Date().toISOString(),
    });
  })
);


/* ==========================================================================
   СИГНАЛИ — какво е забелязано и на коя стъпка е акаунтът

   Тук няма бутон „накажи“. Има бутон „провери“ и бутон „остави го на мира“.
   Програмата стига до третата стъпка (искане за смяна на паролата) сама;
   четвъртата — какво да се прави с акаунта — е човешка и остава тук.
   ========================================================================== */

// GET /api/admin/signali?dni=30
router.get(
  '/signali',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const dni = Math.min(365, Math.max(1, parseInt(String(req.query.dni || '30'), 10) || 30));
    const redove = await akauntiZaPregled(dni);
    await zapishiSpravka(req, 'view_security_signals', 'signals', 'all', { dni });

    res.json({
      success: true,
      data: {
        pragove: PRAGOVE,
        akaunti: redove.map((r) => ({
          user_id: r.user_id,
          email: r.email,
          name: r.name,
          sbor: Number(r.sbor),
          broj: Number(r.broj),
          vidove: r.vidove,
          iska_nova_parola: r.must_change_password,
          posleden: r.posleden,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/admin/users/:id/signali — досието на един акаунт
router.get(
  '/users/:id/signali',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на потребител');

    const [signali, stepenka, ustrojstva, sesii] = await Promise.all([
      signaliNaAkaunt(id),
      stepenkaNaAkaunt(id),
      ustrojstvaNaAkaunt(id),
      aktivniSesii(id),
    ]);
    await zapishiSpravka(req, 'view_user_signals', 'user', id);

    res.json({
      success: true,
      data: { signali, stepenka, ustrojstva, sesii },
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/admin/users/:id/otmeni-iskane — сваля искането за смяна на паролата
router.post(
  '/users/:id/otmeni-iskane',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на потребител');

    // `ochisti` трие и натрупаните сигнали. Без него акаунтът пак минава
    // прага утре и искането се връща — тоест администраторът, проверил и
    // решил, че всичко е наред, трябва да може да занули и историята.
    const ochisti = req.body?.ochisti === true;
    await otmeniIskaneZaParola(id, ochisti);
    await zapishiSpravka(req, 'clear_password_demand', 'user', id, { ochisti });

    res.json({
      success: true,
      message: ochisti
        ? 'Искането е свалено и сигналите са изчистени.'
        : 'Искането за смяна на паролата е свалено.',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/admin/users/:id/max-devices — лимит на различните устройства за 30 дни
router.put(
  '/users/:id/max-devices',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Невалиден номер на потребител');

    const n = parseInt(String(req.body?.max_devices_30d), 10);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      throw new ValidationError('Броят устройства трябва да е между 1 и 20');
    }

    await db.none('UPDATE users SET max_devices_30d = $2 WHERE id = $1', [id, n]);
    await zapishiSpravka(req, 'set_max_devices', 'user', id, { max_devices_30d: n });

    res.json({
      success: true,
      data: { max_devices_30d: n },
      message: `Този акаунт може да ползва ${n} различни устройства за 30 дни.`,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
