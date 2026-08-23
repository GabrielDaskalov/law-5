/**
 * Support тикети — точно каквото сайтът очаква:
 *   createSupportTicket({subject, body}) → POST /api/support/tickets
 *   listMyTickets()                      → GET  /api/support/tickets
 *   adminListTickets()                   → GET  /api/admin/tickets
 *   adminReplyTicket(id, body)           → POST /api/admin/tickets/:id/reply
 *   adminCloseTicket(id)                 → POST /api/admin/tickets/:id/close
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { InputValidator } from '../utils/validation';
import { db } from '../db';

const router = Router();

function requireAdmin(req: any, res: any): boolean {
  if (req.user!.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
      timestamp: new Date().toISOString(),
    });
    return false;
  }
  return true;
}

/** POST /api/support/tickets — създай тикет */
router.post(
  '/support/tickets',
  authenticate,
  asyncHandler(async (req, res) => {
    const { subject, body } = req.body;
    InputValidator.validateString(subject, 'subject', 3, 200);
    InputValidator.validateString(body, 'body', 3, 5000);

    const ticket = await db.one(
      `INSERT INTO support_tickets (user_id, subject, body)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user!.user_id, subject, body]
    );

    res.status(201).json({
      success: true,
      data: ticket,
      message: 'Тикетът е създаден',
      timestamp: new Date().toISOString(),
    });
  })
);

/** GET /api/support/tickets — моите тикети (с отговорите) */
router.get(
  '/support/tickets',
  authenticate,
  asyncHandler(async (req, res) => {
    const tickets = await db.manyOrNone(
      `SELECT t.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'id', r.id, 'body', r.body, 'is_admin', r.is_admin, 'created_at', r.created_at)
            ORDER BY r.created_at)
           FROM ticket_replies r WHERE r.ticket_id = t.id),
          '[]'::json
        ) AS replies
       FROM support_tickets t
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user!.user_id]
    );

    res.json({ success: true, data: tickets, timestamp: new Date().toISOString() });
  })
);

/** GET /api/admin/tickets — всички тикети (админ) */
router.get(
  '/admin/tickets',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const status = req.query.status as string | undefined;

    // Тикетите носят имена, имейли и това, което хората са написали за
    // проблемите си — четенето им от админ е достъп до чужди лични данни и
    // затова оставя следа, макар нищо да не се променя.
    await AuditService.logAction(
      req.user!.user_id,
      'VIEW_ALL_SUPPORT_TICKETS',
      'support_tickets',
      status ? `status:${status}` : 'all',
      { status: status || null },
      req.ip || 'unknown',
      String(req.headers['user-agent'] || '')
    );

    const tickets = await db.manyOrNone(
      `SELECT t.*, u.email AS user_email, u.name AS user_name,
        COALESCE(
          (SELECT json_agg(json_build_object(
              'id', r.id, 'body', r.body, 'is_admin', r.is_admin, 'created_at', r.created_at)
            ORDER BY r.created_at)
           FROM ticket_replies r WHERE r.ticket_id = t.id),
          '[]'::json
        ) AS replies
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE ($1::text IS NULL OR t.status = $1)
       ORDER BY t.created_at DESC`,
      [status || null]
    );

    res.json({ success: true, data: tickets, timestamp: new Date().toISOString() });
  })
);

/** POST /api/admin/tickets/:id/reply — отговор от админ */
router.post(
  '/admin/tickets/:id/reply',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const { body } = req.body;
    InputValidator.validateUUID(id, 'id');
    InputValidator.validateString(body, 'body', 1, 5000);

    const ticket = await db.oneOrNone('SELECT * FROM support_tickets WHERE id = $1', [id]);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Тикетът не съществува',
      });
    }

    const reply = await db.one(
      `INSERT INTO ticket_replies (ticket_id, author_id, is_admin, body)
       VALUES ($1, $2, true, $3) RETURNING *`,
      [id, req.user!.user_id, body]
    );
    await db.none(
      `UPDATE support_tickets SET status = 'answered', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.status(201).json({
      success: true,
      data: reply,
      message: 'Отговорът е изпратен',
      timestamp: new Date().toISOString(),
    });
  })
);

/** POST /api/admin/tickets/:id/close — затвори тикет */
router.post(
  '/admin/tickets/:id/close',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    InputValidator.validateUUID(id, 'id');

    const result = await db.result(
      `UPDATE support_tickets SET status = 'closed', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Тикетът не съществува',
      });
    }

    res.json({ success: true, message: 'Тикетът е затворен', timestamp: new Date().toISOString() });
  })
);

/** POST /api/client-errors — приемник за грешки от браузъра (без auth, лимитиран) */
const errorReports = new Map<string, { count: number; day: string }>();
router.post('/client-errors', asyncHandler(async (req, res) => {
  // максимум 20 доклада на IP на ден — да не може да се наводни базата
  const ip = req.ip || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const rec = errorReports.get(ip);
  if (rec && rec.day === day && rec.count >= 20) {
    return res.status(429).json({ success: false });
  }
  errorReports.set(ip, { count: (rec && rec.day === day ? rec.count : 0) + 1, day });

  const { message, source, stack, url } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false });
  }
  try {
    await db.query(
      `INSERT INTO client_errors (message, source, stack, url, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        String(message).slice(0, 500),
        String(source || '').slice(0, 300),
        String(stack || '').slice(0, 2000),
        String(url || '').slice(0, 300),
        String(req.headers['user-agent'] || '').slice(0, 300),
      ]
    );
  } catch { /* таблицата може да липсва при стара база — не гърмим */ }
  res.json({ success: true });
}));

export default router;
