/**
 * Cases Routes - CRUD operations for legal cases
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

// GET /api/cases
// Query: subject_id, topic_id, court, year, limit, offset
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subjectId = req.query.subject_id as string;
    const topicId = req.query.topic_id as string;
    const court = req.query.court as string;
    const year = req.query.year as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    InputValidator.validatePagination(limit, offset);

    let query = `SELECT id, subject_id, title, topic_id, court, year, created_at FROM cases WHERE 1=1`;
    const params: any[] = [];

    if (subjectId) {
      InputValidator.validateUUID(subjectId, 'subject_id');
      query += ` AND subject_id = $${params.length + 1}`;
      params.push(subjectId);
    }

    if (topicId) {
      InputValidator.validateUUID(topicId, 'topic_id');
      query += ` AND topic_id = $${params.length + 1}`;
      params.push(topicId);
    }

    if (court) {
      InputValidator.validateString(court, 'court', 1, 255);
      query += ` AND court ILIKE $${params.length + 1}`;
      params.push(`%${court}%`);
    }

    if (year) {
      const yearNum = InputValidator.validateNumber(parseInt(year), 'year', 1900, 2100);
      query += ` AND year = $${params.length + 1}`;
      params.push(yearNum);
    }

    query += ` ORDER BY year DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const cases = await db.manyOrNone(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM cases WHERE 1=1';
    const countParams: any[] = [];

    if (subjectId) {
      countQuery += ` AND subject_id = $${countParams.length + 1}`;
      countParams.push(subjectId);
    }

    if (topicId) {
      countQuery += ` AND topic_id = $${countParams.length + 1}`;
      countParams.push(topicId);
    }

    if (court) {
      countQuery += ` AND court ILIKE $${countParams.length + 1}`;
      countParams.push(`%${court}%`);
    }

    if (year) {
      countQuery += ` AND year = $${countParams.length + 1}`;
      countParams.push(parseInt(year));
    }

    const total = await db.one<any>(countQuery, countParams);

    res.json({
      success: true,
      data: cases,
      pagination: {
        limit,
        offset,
        total: parseInt(total.count),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/cases/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'case_id');

    const caseData = await db.oneOrNone(
      `SELECT id, subject_id, topic_id, title, facts, legal_question, decision, analysis,
              "references", court, year, created_at, updated_at
       FROM cases WHERE id = $1`,
      [id]
    );

    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Case not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: caseData,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

// POST /api/cases (admin only)
router.post(
  '/',
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

    if (topic_id) InputValidator.validateUUID(topic_id, 'topic_id');
    if (analysis) InputValidator.validateString(analysis, 'analysis', 1, 5000);
    if (court) InputValidator.validateString(court, 'court', 1, 255);
    if (year) InputValidator.validateNumber(year, 'year', 1900, 2100);

    const id = uuidv4();

    await db.none(
      `INSERT INTO cases (id, subject_id, topic_id, title, facts, legal_question, decision, analysis, "references", court, year)
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
      message: 'Case created successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

// PUT /api/cases/:id (admin only)
router.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, facts, legal_question, decision, analysis, references, court, year, topic_id } = req.body;

    InputValidator.validateUUID(id, 'case_id');

    // Verify case exists
    const caseData = await db.oneOrNone('SELECT id FROM cases WHERE id = $1', [id]);

    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Case not found',
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

    if (facts !== undefined) {
      InputValidator.validateString(facts, 'facts', 10, 10000);
      updates.push(`facts = $${params.length + 1}`);
      params.push(facts);
    }

    if (legal_question !== undefined) {
      InputValidator.validateString(legal_question, 'legal_question', 5, 2000);
      updates.push(`legal_question = $${params.length + 1}`);
      params.push(legal_question);
    }

    if (decision !== undefined) {
      InputValidator.validateString(decision, 'decision', 10, 10000);
      updates.push(`decision = $${params.length + 1}`);
      params.push(decision);
    }

    if (analysis !== undefined) {
      if (analysis !== null) {
        InputValidator.validateString(analysis, 'analysis', 1, 5000);
      }
      updates.push(`analysis = $${params.length + 1}`);
      params.push(analysis);
    }

    if (references !== undefined) {
      updates.push(`"references" = $${params.length + 1}`);
      params.push(JSON.stringify(references || []));
    }

    if (court !== undefined) {
      if (court !== null) {
        InputValidator.validateString(court, 'court', 1, 255);
      }
      updates.push(`court = $${params.length + 1}`);
      params.push(court);
    }

    if (year !== undefined) {
      if (year !== null) {
        InputValidator.validateNumber(year, 'year', 1900, 2100);
      }
      updates.push(`year = $${params.length + 1}`);
      params.push(year);
    }

    if (topic_id !== undefined) {
      if (topic_id !== null) {
        InputValidator.validateUUID(topic_id, 'topic_id');
      }
      updates.push(`topic_id = $${params.length + 1}`);
      params.push(topic_id);
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

    await db.none(`UPDATE cases SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

    res.json({
      success: true,
      message: 'Case updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

// DELETE /api/cases/:id (admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'case_id');

    // Verify case exists
    const caseData = await db.oneOrNone('SELECT id FROM cases WHERE id = $1', [id]);

    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Case not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Delete associated progress records first
    await db.none('DELETE FROM progress WHERE content_id = $1 AND content_type = $2', [
      id,
      'case',
    ]);

    // Delete case
    await db.none('DELETE FROM cases WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Case deleted successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
