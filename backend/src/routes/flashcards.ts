/**
 * Flashcards Routes - CRUD operations for flashcards
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

// GET /api/flashcards
// Query: subject_id, topic_id, difficulty, limit, offset
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const subjectId = req.query.subject_id as string;
    const topicId = req.query.topic_id as string;
    const difficulty = req.query.difficulty as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Validate pagination
    InputValidator.validatePagination(limit, offset);

    // Validate difficulty if provided
    if (difficulty) {
      InputValidator.validateEnum(difficulty, ['easy', 'medium', 'hard'], 'difficulty');
    }

    let query = 'SELECT * FROM flashcards WHERE 1=1';
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

    if (difficulty) {
      query += ` AND difficulty = $${params.length + 1}`;
      params.push(difficulty);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const flashcards = await db.manyOrNone(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM flashcards WHERE 1=1';
    const countParams: any[] = [];

    if (subjectId) {
      countQuery += ` AND subject_id = $${countParams.length + 1}`;
      countParams.push(subjectId);
    }

    if (topicId) {
      countQuery += ` AND topic_id = $${countParams.length + 1}`;
      countParams.push(topicId);
    }

    if (difficulty) {
      countQuery += ` AND difficulty = $${countParams.length + 1}`;
      countParams.push(difficulty);
    }

    const total = await db.one<any>(countQuery, countParams);

    res.json({
      success: true,
      data: flashcards,
      pagination: {
        limit,
        offset,
        total: parseInt(total.count),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/flashcards/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'flashcard_id');

    const flashcard = await db.oneOrNone('SELECT * FROM flashcards WHERE id = $1', [id]);

    if (!flashcard) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Flashcard not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: flashcard,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

// POST /api/flashcards (admin only)
router.post(
  '/',
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
      message: 'Flashcard created successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/flashcards/bulk (admin only)
router.post(
  '/bulk',
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
      message: `${createdIds.length} flashcards created successfully`,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

// PUT /api/flashcards/:id (admin only)
router.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { question, answer, difficulty, topic_id } = req.body;

    InputValidator.validateUUID(id, 'flashcard_id');

    // Verify flashcard exists
    const flashcard = await db.oneOrNone('SELECT id FROM flashcards WHERE id = $1', [id]);

    if (!flashcard) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Flashcard not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];

    if (question !== undefined) {
      InputValidator.validateString(question, 'question', 5, 1000);
      updates.push(`question = $${params.length + 1}`);
      params.push(question);
    }

    if (answer !== undefined) {
      InputValidator.validateString(answer, 'answer', 5, 5000);
      updates.push(`answer = $${params.length + 1}`);
      params.push(answer);
    }

    if (difficulty !== undefined) {
      InputValidator.validateEnum(difficulty, ['easy', 'medium', 'hard'], 'difficulty');
      updates.push(`difficulty = $${params.length + 1}`);
      params.push(difficulty);
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

    await db.none(
      `UPDATE flashcards SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );

    res.json({
      success: true,
      message: 'Flashcard updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

// DELETE /api/flashcards/:id (admin only)
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    InputValidator.validateUUID(id, 'flashcard_id');

    // Verify flashcard exists
    const flashcard = await db.oneOrNone('SELECT id FROM flashcards WHERE id = $1', [id]);

    if (!flashcard) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Flashcard not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Delete associated progress records first (foreign key constraint)
    await db.none('DELETE FROM progress WHERE content_id = $1 AND content_type = $2', [
      id,
      'flashcard',
    ]);

    // Delete flashcard
    await db.none('DELETE FROM flashcards WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Flashcard deleted successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
