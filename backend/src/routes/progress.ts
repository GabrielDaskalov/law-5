import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';
import { ProgressService } from '../services/progressService';
import { StudyPlanService } from '../services/studyPlanService';
import { InputValidator } from '../utils/validation';
import { ValidationError } from '../types';

const router = Router();

// GET /api/progress
// Query: content_type, limit, offset
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const contentType = req.query.content_type as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = 'SELECT * FROM progress WHERE user_id = $1';
    const params: any[] = [userId];

    if (contentType) {
      query += ` AND content_type = $${params.length + 1}`;
      params.push(contentType);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const progress = await db.manyOrNone(query, params);

    res.json({
      success: true,
      data: progress,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/progress/dashboard
router.get(
  '/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const dashboardData = await ProgressService.getDashboardStats(userId);

    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/progress/subject/:subject_id
router.get(
  '/subject/:subject_id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { subject_id } = req.params;

    const subjectProgress = await ProgressService.getSubjectProgress(userId, subject_id);

    res.json({
      success: true,
      data: subjectProgress,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/progress/:content_type/:content_id
router.post(
  '/:content_type/:content_id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { content_type, content_id } = req.params;
    const { status, score } = req.body;

    // Validate input
    if (!status) {
      throw new ValidationError('status is required');
    }

    const validStatuses = ['not_started', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const progressData = await ProgressService.updateProgress(
      userId,
      content_type,
      content_id,
      status,
      score
    );

    res.status(201).json({
      success: true,
      data: progressData,
      message: 'Progress updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/progress/study-plan/generate
router.post(
  '/study-plan/generate',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { exam_date, subject_ids } = req.body;

    // Validate exam date
    const examDate = InputValidator.validateFutureDate(exam_date, 'exam_date');

    // Validate subject IDs if provided
    let subjectIdList: string[] | undefined;
    if (subject_ids) {
      InputValidator.validateArray(subject_ids, 'subject_ids', 0);
      if (subject_ids.length > 0) {
        subjectIdList = subject_ids;
        subject_ids.forEach((id: string) => InputValidator.validateUUID(id, 'subject_id'));
      }
    }

    // Generate study plan
    const planId = await StudyPlanService.generateStudyPlan(userId, examDate, subjectIdList);

    res.status(201).json({
      success: true,
      data: { plan_id: planId },
      message: 'Study plan generated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/progress/study-plan
router.get(
  '/study-plan',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const studyPlan = await StudyPlanService.getStudyPlan(userId);

    if (!studyPlan) {
      return res.json({
        success: true,
        data: {
          plan: null,
          message: 'No active study plan found',
        },
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: studyPlan,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/progress/study-plan/today/focus
router.get(
  '/study-plan/today/focus',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const todayFocus = await StudyPlanService.getTodayFocus(userId);

    res.json({
      success: true,
      data: todayFocus,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/progress/study-plan/stats
router.get(
  '/study-plan/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const stats = await StudyPlanService.getPlanStats(userId);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/progress/study-plan/task/:task_id/reschedule
router.put(
  '/study-plan/task/:task_id/reschedule',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { task_id } = req.params;
    const { new_date } = req.body;

    // Validate new date
    const newDate = InputValidator.validateDate(new_date, 'new_date');

    // Reschedule task
    await StudyPlanService.rescheduleTask(userId, task_id, newDate);

    res.json({
      success: true,
      message: 'Task rescheduled successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/progress/study-plan/:task_id
router.put(
  '/study-plan/:task_id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { task_id } = req.params;
    const { status } = req.body;

    if (!status) {
      throw new ValidationError('status is required');
    }

    const validStatuses = ['upcoming', 'in_progress', 'completed', 'skipped'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Verify task belongs to user
    const task = await db.oneOrNone(
      `SELECT spt.id FROM study_plan_tasks spt
       JOIN study_plans sp ON spt.plan_id = sp.id
       WHERE spt.id = $1 AND sp.user_id = $2`,
      [task_id, userId]
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Task not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Update task
    await db.none(
      `UPDATE study_plan_tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, task_id]
    );

    res.json({
      success: true,
      message: 'Task updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
