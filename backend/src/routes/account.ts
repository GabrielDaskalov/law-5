/**
 * Акаунт и синхронизация — липсващите функционалности от сайта:
 *
 *   Прогрес между устройства:
 *     GET /api/me/state   → последният запазен прогрес
 *     PUT /api/me/state   → качва прогреса (сайтът го праща периодично)
 *
 *   Централно учебно съдържание (PA_DATA):
 *     GET /api/content          → публично, сайтът го зарежда при старт
 *     PUT /api/admin/content    → админът качва ново съдържание
 *
 *   Акаунт:
 *     PUT    /api/user/email    → смяна на имейл (с парола)
 *     DELETE /api/me            → изтриване на акаунт (soft delete)
 *     GET    /api/me/export     → експорт на моите данни (GDPR)
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, asyncHandler, invalidateUserState } from '../middleware/auth';
import { InputValidator } from '../utils/validation';
import { db } from '../db';

const router = Router();

// Максимален размер на state (пази от злоупотреба) — 2 MB
const MAX_STATE_BYTES = 2 * 1024 * 1024;

/* ============================================================
   ПРОГРЕС МЕЖДУ УСТРОЙСТВА
   ============================================================ */

/** GET /api/me/state */
router.get(
  '/me/state',
  authenticate,
  asyncHandler(async (req, res) => {
    const row = await db.oneOrNone(
      'SELECT state, device_label, updated_at FROM user_states WHERE user_id = $1',
      [req.user!.user_id]
    );
    res.json({
      success: true,
      data: row || { state: null, updated_at: null },
      timestamp: new Date().toISOString(),
    });
  })
);

/** PUT /api/me/state — Body: { state: object, device_label?: string } */
router.put(
  '/me/state',
  authenticate,
  asyncHandler(async (req, res) => {
    const { state, device_label } = req.body;

    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid State',
        message: 'state трябва да е обект',
      });
    }

    const raw = JSON.stringify(state);
    if (Buffer.byteLength(raw, 'utf-8') > MAX_STATE_BYTES) {
      return res.status(413).json({
        success: false,
        error: 'State Too Large',
        message: 'Прогресът надвишава лимита от 2 MB',
      });
    }

    // Никога не пазим чувствителни неща вътре в state
    delete (state as any).user;

    const row = await db.one(
      `INSERT INTO user_states (user_id, state, device_label, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         state = $2, device_label = $3, updated_at = NOW()
       RETURNING updated_at`,
      [req.user!.user_id, JSON.stringify(state), (device_label || '').slice(0, 100) || null]
    );

    res.json({
      success: true,
      data: { updated_at: row.updated_at },
      message: 'Прогресът е запазен',
      timestamp: new Date().toISOString(),
    });
  })
);

/* ============================================================
   ЦЕНТРАЛНО УЧЕБНО СЪДЪРЖАНИЕ (PA_DATA)
   ============================================================ */

/**
 * GET /api/content — ЦЕЛИЯТ blob със съдържанието.
 *
 * ДУПКА, ЗАТВОРЕНА ТУК: маршрутът беше публичен. Всеки, който отвореше
 * адреса, сваляше пълното платено съдържание на всички дисциплини —
 * плащането не пазеше нищо. Днес blob-ът служи само за архив и за стария
 * монолитен файл, затова остава достъпен единствено за админ.
 *
 * Витрината и учебните екрани вече ползват /api/content/* от новия
 * маршрутизатор, където достъпът се проверява тема по тема.
 */
router.get(
  '/content',
  authenticate,
  asyncHandler(async (_req, res) => {
    if (_req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Пълното съдържание е достъпно само за администратор',
        timestamp: new Date().toISOString(),
      });
    }

    const row = await db.oneOrNone(
      `SELECT data, version, updated_at FROM site_content WHERE id = 'main'`
    );
    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'No Content',
        message: 'Все още няма качено съдържание — сайтът ползва вградените данни',
      });
    }
    res.json({ success: true, data: row, timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/content/:subjectId — съдържание на дисциплина СПОРЕД покупките.
 *
 * Защо: в самостоятелния HTML данните са вградени (нужно за офлайн), но
 * това значи, че view-source ги разкрива. За hosted production вариант
 * данните могат да се МАХНАТ от HTML-а и да се зареждат оттук:
 *   - купил потребител (или админ) → пълното съдържание на дисциплината
 *   - некупил → само главите + първите 5 флашкарти (free preview)
 */
router.get(
  '/content/:subjectId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { subjectId } = req.params;
    if (!/^[a-z]{1,20}$/.test(subjectId)) {
      return res.status(400).json({ success: false, error: 'Invalid Subject', message: 'Невалидна дисциплина' });
    }

    const row = await db.oneOrNone<any>(`SELECT data FROM site_content WHERE id = 'main'`);
    if (!row) {
      return res.status(404).json({ success: false, error: 'No Content', message: 'Няма качено съдържание' });
    }

    const data = row.data || {};
    const slice = {
      chapters: data.chapters?.[subjectId] || [],
      conspectFull: data.conspectFull?.[subjectId] || [],
      flashcards: data.flashcards?.[subjectId] || [],
      quizzes: data.quizzes?.[subjectId] || [],
      cases: data.cases?.[subjectId] || [],
    };

    // Собственост?
    const isAdmin = req.user!.role === 'admin';
    const owned = isAdmin || !!(await db.oneOrNone(
      `SELECT 1 FROM purchases WHERE user_id = $1 AND package_id = $2 AND status = 'completed'`,
      [req.user!.user_id, subjectId]
    ));

    if (!owned) {
      // Free preview: глави + 5 карти; без конспект/тестове/казуси
      return res.json({
        success: true,
        data: {
          owned: false,
          chapters: slice.chapters,
          flashcards: slice.flashcards.slice(0, 5),
          conspectFull: [], quizzes: [], cases: [],
        },
        message: 'Безплатен преглед — купи пакета за пълното съдържание',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, data: { owned: true, ...slice }, timestamp: new Date().toISOString() });
  })
);

/** PUT /api/admin/content — админът качва PA_DATA (вместо Export на файл) */
router.put(
  '/admin/content',
  authenticate,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Content',
        message: 'data трябва да е обект (PA_DATA)',
      });
    }

    const row = await db.one(
      `INSERT INTO site_content (id, data, version, updated_by, updated_at)
       VALUES ('main', $1, 1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET
         data = $1, version = site_content.version + 1,
         updated_by = $2, updated_at = NOW()
       RETURNING version, updated_at`,
      [JSON.stringify(data), req.user!.user_id]
    );

    res.json({
      success: true,
      data: row,
      message: `Съдържанието е качено (версия ${row.version})`,
      timestamp: new Date().toISOString(),
    });
  })
);

/* ============================================================
   АКАУНТ
   ============================================================ */

/** PUT /api/user/email — Body: { new_email, password } */
router.put(
  '/user/email',
  authenticate,
  asyncHandler(async (req, res) => {
    const { new_email, password } = req.body;
    InputValidator.validateEmail(new_email);

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password Required',
        message: 'Паролата е задължителна за смяна на имейл',
      });
    }

    const user = await db.one<any>(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.user_id]
    );
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Password',
        message: 'Грешна парола',
      });
    }

    const taken = await db.oneOrNone('SELECT id FROM users WHERE email = $1', [
      new_email.toLowerCase(),
    ]);
    if (taken) {
      return res.status(400).json({
        success: false,
        error: 'Email Taken',
        message: 'Този имейл вече се използва',
      });
    }

    await db.none('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [
      new_email.toLowerCase(),
      req.user!.user_id,
    ]);

    res.json({
      success: true,
      message: 'Имейлът е сменен. Влез отново с новия имейл.',
      timestamp: new Date().toISOString(),
    });
  })
);

/** DELETE /api/me — Body: { password } — soft delete */
router.delete(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password Required',
        message: 'Паролата е задължителна за изтриване на акаунт',
      });
    }

    const user = await db.one<any>(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.user_id]
    );
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Password',
        message: 'Грешна парола',
      });
    }

    // Soft delete: акаунтът се деактивира; данните остават 30 дни
    // (позволява възстановяване при грешка). Изчистване: cron/ръчно.
    await db.none(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [req.user!.user_id]
    );

    // Без това токенът работи още до минута (колкото е кешът в authenticate).
    invalidateUserState(req.user!.user_id);

    res.json({
      success: true,
      message: 'Акаунтът е деактивиран. Данните се изтриват окончателно след 30 дни.',
      timestamp: new Date().toISOString(),
    });
  })
);

/** PUT /api/me/preferences — Body: { email_reminders?: boolean } */
router.put(
  '/me/preferences',
  authenticate,
  asyncHandler(async (req, res) => {
    const { email_reminders } = req.body;
    if (typeof email_reminders !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Preferences',
        message: 'email_reminders трябва да е true/false',
      });
    }
    await db.none('UPDATE users SET email_reminders = $1, updated_at = NOW() WHERE id = $2', [
      email_reminders,
      req.user!.user_id,
    ]);
    res.json({
      success: true,
      message: email_reminders ? 'Напомнянията са включени' : 'Напомнянията са изключени',
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/me/export — всичките ми данни (GDPR) */
router.get(
  '/me/export',
  authenticate,
  asyncHandler(async (req, res) => {
    const uid = req.user!.user_id;
    const [profile, purchases, payments, tickets, stateRow] = await Promise.all([
      db.oneOrNone(
        'SELECT id, email, name, role, created_at, last_login FROM users WHERE id = $1',
        [uid]
      ),
      db.manyOrNone('SELECT package_id, amount, currency, status, created_at FROM purchases WHERE user_id = $1', [uid]),
      db.manyOrNone('SELECT amount, currency, status, description, created_at FROM payments WHERE user_id = $1', [uid]),
      db.manyOrNone('SELECT subject, body, status, created_at FROM support_tickets WHERE user_id = $1', [uid]),
      db.oneOrNone('SELECT state, updated_at FROM user_states WHERE user_id = $1', [uid]),
    ]);

    res.setHeader('Content-Disposition', 'attachment; filename="pravo-academy-my-data.json"');
    res.json({
      exported_at: new Date().toISOString(),
      profile,
      purchases,
      payments,
      support_tickets: tickets,
      learning_progress: stateRow,
    });
  })
);

export default router;
