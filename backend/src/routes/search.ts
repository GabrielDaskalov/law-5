/**
 * Search Routes - Full-text search across all learning materials
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/auth';
import { SearchService } from '../services/searchService';
import { InputValidator } from '../utils/validation';

const router = Router();

// ============================================================================
// GLOBAL SEARCH
// ============================================================================

// GET /api/search
// Query: q (required), limit, offset
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Query parameter "q" is required',
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'q', 2, 255);
    InputValidator.validatePagination(limit, offset);

    const results = await SearchService.globalSearch(query, limit, offset);

    res.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// CONTENT-SPECIFIC SEARCH
// ============================================================================

// GET /api/search/flashcards
// Query: q, subject_id, difficulty, limit, offset
router.get(
  '/flashcards',
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const subjectId = req.query.subject_id as string;
    const difficulty = req.query.difficulty as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Query parameter "q" is required',
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'q', 2, 255);
    InputValidator.validatePagination(limit, offset);

    if (subjectId) {
      InputValidator.validateUUID(subjectId, 'subject_id');
    }

    if (difficulty) {
      InputValidator.validateEnum(difficulty, ['easy', 'medium', 'hard'], 'difficulty');
    }

    const results = await SearchService.searchFlashcards(query, subjectId, difficulty, limit, offset);

    res.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/search/cases
// Query: q, subject_id, court, limit, offset
router.get(
  '/cases',
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const subjectId = req.query.subject_id as string;
    const court = req.query.court as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Query parameter "q" is required',
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'q', 2, 255);
    InputValidator.validatePagination(limit, offset);

    if (subjectId) {
      InputValidator.validateUUID(subjectId, 'subject_id');
    }

    const results = await SearchService.searchCases(query, subjectId, court, limit, offset);

    res.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/search/conspects
// Query: q, subject_id, limit, offset
router.get(
  '/conspects',
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const subjectId = req.query.subject_id as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Query parameter "q" is required',
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'q', 2, 255);
    InputValidator.validatePagination(limit, offset);

    if (subjectId) {
      InputValidator.validateUUID(subjectId, 'subject_id');
    }

    const results = await SearchService.searchConspects(query, subjectId, limit, offset);

    res.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/search/lectures
// Query: q, subject_id, limit, offset
router.get(
  '/lectures',
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const subjectId = req.query.subject_id as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Query parameter "q" is required',
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'q', 2, 255);
    InputValidator.validatePagination(limit, offset);

    if (subjectId) {
      InputValidator.validateUUID(subjectId, 'subject_id');
    }

    const results = await SearchService.searchLectures(query, subjectId, limit, offset);

    res.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// SEARCH SUGGESTIONS
// ============================================================================

// GET /api/search/suggestions
// Query: q, limit
router.get(
  '/suggestions',
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'q', 2, 255);

    const suggestions = await SearchService.getSearchSuggestions(query, limit);

    res.json({
      success: true,
      data: suggestions,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// ADVANCED SEARCH
// ============================================================================

// POST /api/search/advanced
// Body: query, type, subject_id, difficulty, court, year_from, year_to, limit, offset
router.post(
  '/advanced',
  asyncHandler(async (req, res) => {
    const {
      query,
      type = 'all',
      subject_id,
      difficulty,
      court,
      year_from,
      year_to,
      limit = 20,
      offset = 0,
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: '"query" is required',
        timestamp: new Date().toISOString(),
      });
    }

    InputValidator.validateString(query, 'query', 2, 255);
    InputValidator.validateEnum(type, ['flashcard', 'case', 'conspect', 'lecture', 'all'], 'type');
    InputValidator.validatePagination(limit, offset);

    if (subject_id) {
      InputValidator.validateUUID(subject_id, 'subject_id');
    }

    if (difficulty) {
      InputValidator.validateEnum(difficulty, ['easy', 'medium', 'hard'], 'difficulty');
    }

    if (year_from) {
      InputValidator.validateNumber(year_from, 'year_from', 1900, 2100);
    }

    if (year_to) {
      InputValidator.validateNumber(year_to, 'year_to', 1900, 2100);
    }

    const results = await SearchService.advancedSearch({
      query,
      type,
      subject_id,
      difficulty,
      court,
      year_from,
      year_to,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
