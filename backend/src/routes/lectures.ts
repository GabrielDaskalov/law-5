/**
 * Lectures Routes - CRUD operations for lectures and video content
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';
import { InputValidator } from '../utils/validation';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Admin authorization middleware
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
// READ OPERATIONS
// ============================================================================

// GET /api/lectures
// Query: subject_id, limit, offset
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subjectId = req.query.subject_id as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    InputValidator.validatePagination(limit, offset);

    let query = `SELECT id, subject_id, title, youtube_url, duration, description, created_at FROM lectures WHERE 1=1`;
    const params: any[] = [];

    if (subjectId) {
      InputValidator.validateUUID(subjectId, 'subject_id');
      query += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const lectures = await db.manyOrNone(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM lectures WHERE 1=1';
    const countParams: any[] = [];

    if (subjectId) {
      countQuery += ` AND subject_id = $${countParams.length + 1}`;
      countParams.push(subjectId);
    }

    const total = await db.one<any>(countQuery, countParams);

    res.json({
      success: true,
      data: lectures,
      pagination: {
        limit,
        offset,
        total: parseInt(total.count),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/lectures/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'lecture_id');

    const lecture = await db.oneOrNone('SELECT * FROM lectures WHERE id = $1', [id]);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Lecture not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: lecture,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/lectures/:id/chapters
router.get(
  '/:id/chapters',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'lecture_id');

    const lecture = await db.oneOrNone('SELECT chapters FROM lectures WHERE id = $1', [id]);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Lecture not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: lecture.chapters || [],
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

// POST /api/lectures (admin only)
router.post(
  '/',
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
      message: 'Lecture created successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

// PUT /api/lectures/:id (admin only)
router.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, youtube_url, duration, chapters, description } = req.body;

    InputValidator.validateUUID(id, 'lecture_id');

    // Verify lecture exists
    const lecture = await db.oneOrNone('SELECT id FROM lectures WHERE id = $1', [id]);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Lecture not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
      InputValidator.validateString(title, 'title', 3, 255);
      updates.push(`title = $${params.length + 1}`);
      params.push(title);
    }

    if (youtube_url !== undefined) {
      if (youtube_url !== null) {
        InputValidator.validateURL(youtube_url, 'youtube_url');
      }
      updates.push(`youtube_url = $${params.length + 1}`);
      params.push(youtube_url);
    }

    if (duration !== undefined) {
      if (duration !== null) {
        InputValidator.validateNumber(duration, 'duration', 1);
      }
      updates.push(`duration = $${params.length + 1}`);
      params.push(duration);
    }

    if (chapters !== undefined) {
      updates.push(`chapters = $${params.length + 1}`);
      params.push(JSON.stringify(chapters || []));
    }

    if (description !== undefined) {
      updates.push(`description = $${params.length + 1}`);
      params.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No fields to update',
        timestamp: new Date().toISOString(),
      });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await db.none(
      `UPDATE lectures SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );

    res.json({
      success: true,
      message: 'Lecture updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/lectures/:id/chapters (admin only)
router.put(
  '/:id/chapters',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { chapters } = req.body;

    InputValidator.validateUUID(id, 'lecture_id');
    InputValidator.validateArray(chapters, 'chapters', 0);

    // Verify lecture exists
    const lecture = await db.oneOrNone('SELECT id FROM lectures WHERE id = $1', [id]);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Lecture not found',
        timestamp: new Date().toISOString(),
      });
    }

    await db.none('UPDATE lectures SET chapters = $1, updated_at = NOW() WHERE id = $2', [
      JSON.stringify(chapters),
      id,
    ]);

    res.json({
      success: true,
      message: 'Lecture chapters updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

// DELETE /api/lectures/:id (admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'lecture_id');

    // Verify lecture exists
    const lecture = await db.oneOrNone('SELECT id FROM lectures WHERE id = $1', [id]);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Lecture not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Delete associated progress records first
    await db.none('DELETE FROM progress WHERE content_id = $1 AND content_type = $2', [
      id,
      'lecture',
    ]);

    // Delete lecture
    await db.none('DELETE FROM lectures WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Lecture deleted successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
