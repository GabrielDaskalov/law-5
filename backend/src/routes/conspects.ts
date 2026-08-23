import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';

const router = Router();

// GET /api/conspects
// Query: subject_id, limit, offset
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subjectId = req.query.subject_id as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = 'SELECT id, title, subject_id, created_at, updated_at FROM conspects WHERE 1=1';
    const params: any[] = [];

    if (subjectId) {
      query += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const conspects = await db.manyOrNone(query, params);

    res.json({
      success: true,
      data: conspects,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/conspects/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const conspect = await db.oneOrNone(
      'SELECT * FROM conspects WHERE id = $1',
      [id]
    );

    if (!conspect) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Conspect not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: conspect,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/conspects (admin only)
// TODO: Add admin authorization
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { subject_id, title, content, toc } = req.body;

    // TODO: Implement validation

    const id = require('uuid').v4();
    const now = new Date();

    await db.none(
      `INSERT INTO conspects (id, subject_id, title, content, toc, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, subject_id, title, content, JSON.stringify(toc), now, now]
    );

    res.status(201).json({
      success: true,
      data: { id },
      message: 'Conspect created successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
