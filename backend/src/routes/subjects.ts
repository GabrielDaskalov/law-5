import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';

const router = Router();

// GET /api/subjects
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const subjects = await db.manyOrNone(
      `SELECT id, title, description, icon_url, order_index
       FROM subjects
       WHERE is_active = true
       ORDER BY order_index ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = await db.one<{ count: number }>(
      'SELECT COUNT(*) as count FROM subjects WHERE is_active = true'
    );

    res.json({
      success: true,
      data: {
        items: subjects,
        total: total.count,
        limit,
        offset,
        hasMore: offset + limit < total.count,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/subjects/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const subject = await db.oneOrNone(
      'SELECT * FROM subjects WHERE id = $1 AND is_active = true',
      [id]
    );

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Subject not found',
        timestamp: new Date().toISOString(),
      });
    }

    const topics = await db.manyOrNone(
      `SELECT id, title, description
       FROM topics
       WHERE subject_id = $1
       ORDER BY order_index ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...subject,
        topics,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/subjects/:id/topics
router.get(
  '/:id/topics',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const topics = await db.manyOrNone(
      `SELECT id, title, description, order_index
       FROM topics
       WHERE subject_id = $1
       ORDER BY order_index ASC`,
      [id]
    );

    res.json({
      success: true,
      data: topics,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/subjects/:id/progress (requires auth)
router.get(
  '/:id/progress',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.user_id;

    // Calculate completion percentage
    const result = await db.one<any>(
      `SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as items_done
       FROM progress
       WHERE user_id = $1
       AND content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $2
         UNION ALL
         SELECT id FROM quiz_questions WHERE quiz_id IN (
           SELECT id FROM quizzes WHERE subject_id = $2
         )
       )`,
      [userId, id]
    );

    const completion = result.total_items > 0
      ? Math.round((result.items_done / result.total_items) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        subject_id: id,
        completion_percentage: completion,
        items_done: result.items_done || 0,
        total_items: result.total_items || 0,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
