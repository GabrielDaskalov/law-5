/**
 * Notifications Routes - Handle user notifications and preferences
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';
import { NotificationSchedulerService } from '../services/notificationSchedulerService';
import { InputValidator } from '../utils/validation';
import { ValidationError } from '../types';

const router = Router();

// ============================================================================
// NOTIFICATION RETRIEVAL
// ============================================================================

// GET /api/notifications
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    InputValidator.validatePagination(limit, offset);

    const notifications = await db.manyOrNone(
      `SELECT id, type, title, message, related_id, scheduled_at, sent_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = await db.one<any>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      data: notifications,
      pagination: {
        limit,
        offset,
        total: parseInt(total.count),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/notifications/pending
router.get(
  '/pending',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const limit = parseInt(req.query.limit as string) || 10;

    const pending = await NotificationSchedulerService.getPendingNotifications(userId, limit);

    res.json({
      success: true,
      data: pending,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/notifications/achievements
router.get(
  '/achievements',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const achievements = await db.manyOrNone(
      `SELECT id, title, message, created_at
       FROM notifications
       WHERE user_id = $1 AND type = 'achievement'
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: achievements,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// NOTIFICATION MANAGEMENT
// ============================================================================

// DELETE /api/notifications/:id
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { id } = req.params;

    InputValidator.validateUUID(id, 'notification_id');

    // Verify notification belongs to user
    const notification = await db.oneOrNone(
      'SELECT id FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Notification not found',
        timestamp: new Date().toISOString(),
      });
    }

    await db.none('DELETE FROM notifications WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Notification deleted',
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/notifications
router.delete(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const deletedCount = await db.result(
      'DELETE FROM notifications WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: `${deletedCount.rowCount} notifications deleted`,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

// GET /api/notifications/preferences
router.get(
  '/preferences',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const preferences = await NotificationSchedulerService.getNotificationPreferences(userId);

    res.json({
      success: true,
      data: preferences,
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/notifications/preferences
router.put(
  '/preferences',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const preferences = req.body;

    // Validate preferences
    const allowedKeys = [
      'email_quiz_reminders',
      'email_exam_countdowns',
      'email_weekly_reports',
      'email_achievements',
    ];

    for (const key of Object.keys(preferences)) {
      if (!allowedKeys.includes(key)) {
        throw new ValidationError(`Invalid preference: ${key}`);
      }
      if (typeof preferences[key] !== 'boolean') {
        throw new ValidationError(`Preference ${key} must be a boolean`);
      }
    }

    await NotificationSchedulerService.updateNotificationPreferences(userId, preferences);

    res.json({
      success: true,
      message: 'Notification preferences updated',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// ACHIEVEMENT CHECK (Admin/Utility)
// ============================================================================

// POST /api/notifications/check-achievements
router.post(
  '/check-achievements',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const newAchievements = await NotificationSchedulerService.checkAchievements(userId);

    res.json({
      success: true,
      data: {
        achievements: newAchievements,
        count: newAchievements.length,
      },
      message: `${newAchievements.length} new achievement(s) unlocked!`,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// MANUAL NOTIFICATION SCHEDULING (For admins)
// ============================================================================

// POST /api/notifications/schedule-exam-countdown
router.post(
  '/schedule-exam-countdown',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { subject_id, exam_date } = req.body;

    InputValidator.validateUUID(subject_id, 'subject_id');
    const examDate = InputValidator.validateFutureDate(exam_date, 'exam_date');

    await NotificationSchedulerService.scheduleExamCountdown(userId, subject_id, examDate);

    res.json({
      success: true,
      message: 'Exam countdown scheduled',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/notifications/schedule-weekly-report
router.post(
  '/schedule-weekly-report',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    await NotificationSchedulerService.scheduleWeeklyReport(userId);

    res.json({
      success: true,
      message: 'Weekly report scheduled',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/notifications/schedule-study-reminder
router.post(
  '/schedule-study-reminder',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    await NotificationSchedulerService.scheduleStudyReminder(userId);

    res.json({
      success: true,
      message: 'Study reminder scheduled',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
