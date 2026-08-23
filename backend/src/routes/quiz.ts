import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { QuizService } from '../services/quizService';
import { ValidationError } from '../types';

const router = Router();

// GET /api/quiz/:subject (get all quizzes for a subject)
router.get(
  '/subject/:subject_id',
  asyncHandler(async (req, res) => {
    const { subject_id } = req.params;

    const quizzes = await QuizService.getQuizWithQuestions(subject_id);

    res.json({
      success: true,
      data: quizzes,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/quiz/:id/questions (get questions for a quiz)
router.get(
  '/:id/questions',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const quiz = await QuizService.getQuizWithQuestions(id);

    res.json({
      success: true,
      data: quiz.questions,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/quiz/submit (submit quiz answers)
router.post(
  '/submit',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { quiz_id, answers } = req.body;

    // Validate input
    if (!quiz_id) {
      throw new ValidationError('quiz_id is required');
    }

    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      throw new ValidationError('answers must be a non-empty object');
    }

    // Submit quiz and get result
    const result = await QuizService.submitQuiz(userId, quiz_id, answers);

    res.json({
      success: true,
      data: result,
      message: 'Quiz submitted successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/quiz/:id/results (get user's quiz results)
router.get(
  '/:id/results',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { id } = req.params;

    const result = await QuizService.getUserQuizResult(userId, id);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/quiz/history (get user's quiz history)
router.get(
  '/history',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await QuizService.getUserQuizHistory(userId, limit, offset);

    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/quiz/stats (get user's quiz statistics)
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const subjectId = req.query.subject_id as string;

    const stats = await QuizService.getQuizStats(userId, subjectId);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
