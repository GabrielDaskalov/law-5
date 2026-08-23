/**
 * Notification Scheduler Service - Manages automated notifications and emails
 * Handles study reminders, exam countdowns, achievement emails, and weekly reports
 */

import { db } from '../db';
import { EmailService } from './emailService';
import { ProgressService } from './progressService';
import { v4 as uuidv4 } from 'uuid';

export interface NotificationEvent {
  type: 'quiz_reminder' | 'exam_countdown' | 'achievement' | 'weekly_report' | 'study_reminder';
  user_id: string;
  subject_id?: string;
  data: Record<string, any>;
  scheduled_for: Date;
}

export class NotificationSchedulerService {
  /**
   * Schedule quiz reminder for user
   * Called after quiz is assigned or before quiz starts
   */
  static async scheduleQuizReminder(userId: string, quizId: string, quizTitle: string, reminderDate: Date) {
    const notificationId = uuidv4();

    await db.none(
      `INSERT INTO notifications (id, user_id, type, title, message, related_id, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        notificationId,
        userId,
        'quiz_reminder',
        `Quiz Reminder: ${quizTitle}`,
        `Don't forget to take the ${quizTitle} quiz!`,
        quizId,
        reminderDate,
      ]
    );

    // Get user email
    const user = await db.one('SELECT email, first_name FROM users WHERE id = $1', [userId]);

    // Send email
    try {
      await EmailService.sendQuizReminderEmail(user.email, quizTitle);
    } catch (error) {
      console.error('Failed to send quiz reminder:', error);
    }

    return notificationId;
  }

  /**
   * Schedule exam countdown reminders
   * Called when exam date is set or periodically
   */
  static async scheduleExamCountdown(userId: string, subjectId: string, examDate: Date) {
    const now = new Date();
    const daysUntilExam = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Send different reminders based on days remaining
    const reminders = [
      { daysOut: 7, send: daysUntilExam <= 7 },
      { daysOut: 3, send: daysUntilExam <= 3 },
      { daysOut: 1, send: daysUntilExam <= 1 },
    ];

    for (const reminder of reminders) {
      if (reminder.send) {
        const notificationId = uuidv4();
        const reminderDate = new Date(now);
        reminderDate.setDate(reminderDate.getDate() + reminder.daysOut);

        await db.none(
          `INSERT INTO notifications (id, user_id, type, title, message, related_id, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            notificationId,
            userId,
            'exam_countdown',
            `Exam in ${reminder.daysOut} day(s)`,
            `Your exam is coming up in ${reminder.daysOut} day(s). Make sure you're prepared!`,
            subjectId,
            reminderDate,
          ]
        );
      }
    }

    // Get user and subject info
    const user = await db.one('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    const subject = await db.one('SELECT title FROM subjects WHERE id = $1', [subjectId]);

    // Send email
    try {
      await EmailService.sendExamCountdownEmail(user.email, subject.title, daysUntilExam);
    } catch (error) {
      console.error('Failed to send exam countdown:', error);
    }
  }

  /**
   * Schedule achievement notification
   * Called when user achieves specific milestones
   */
  static async scheduleAchievement(userId: string, achievementName: string, description: string) {
    const notificationId = uuidv4();

    await db.none(
      `INSERT INTO notifications (id, user_id, type, title, message, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        notificationId,
        userId,
        'achievement',
        `Achievement: ${achievementName}`,
        description,
        new Date(),
      ]
    );

    // Get user email
    const user = await db.one('SELECT email FROM users WHERE id = $1', [userId]);

    // Send email
    try {
      await EmailService.sendAchievementEmail(user.email, achievementName, description);
    } catch (error) {
      console.error('Failed to send achievement email:', error);
    }

    return notificationId;
  }

  /**
   * Schedule weekly report email
   * Called on specific day/time (usually Monday morning)
   */
  static async scheduleWeeklyReport(userId: string, reportDate: Date = new Date()) {
    const notificationId = uuidv4();

    await db.none(
      `INSERT INTO notifications (id, user_id, type, title, message, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        notificationId,
        userId,
        'weekly_report',
        'Your Weekly Progress Report',
        'Check your progress from this week!',
        reportDate,
      ]
    );

    // Get user and stats
    const user = await db.one('SELECT email, first_name FROM users WHERE id = $1', [userId]);
    const stats = await ProgressService.getDashboardStats(userId);

    // Calculate weekly stats
    const weeklyStats = {
      flashcards_completed: stats.items_this_week || 0,
      quizzes_taken: 0, // Would need separate calculation
      average_score: 0, // Would need separate calculation
      current_streak: stats.current_streak || 0,
    };

    // Send email
    try {
      await EmailService.sendWeeklyReportEmail(user.email, user.first_name, weeklyStats);
    } catch (error) {
      console.error('Failed to send weekly report:', error);
    }

    return notificationId;
  }

  /**
   * Schedule study reminder for upcoming tasks
   * Called daily or when user checks dashboard
   */
  static async scheduleStudyReminder(userId: string, reminderDate: Date = new Date()) {
    const notificationId = uuidv4();

    // Get today's tasks
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysTasks = await db.manyOrNone(
      `SELECT COUNT(*) as task_count FROM study_plan_tasks spt
       JOIN study_plans sp ON spt.plan_id = sp.id
       WHERE sp.user_id = $1 AND DATE(spt.date) = DATE($2)`,
      [userId, today]
    );

    const taskCount = todaysTasks?.[0]?.task_count || 0;

    await db.none(
      `INSERT INTO notifications (id, user_id, type, title, message, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        notificationId,
        userId,
        'study_reminder',
        "Today's Study Tasks",
        `You have ${taskCount} task(s) to complete today!`,
        reminderDate,
      ]
    );

    return notificationId;
  }

  /**
   * Get pending notifications for user
   * Returns notifications that are scheduled for current time or earlier
   */
  static async getPendingNotifications(userId: string, limit: number = 10) {
    const notifications = await db.manyOrNone(
      `SELECT id, type, title, message, related_id, scheduled_at, sent_at
       FROM notifications
       WHERE user_id = $1 AND scheduled_at <= NOW()
       ORDER BY scheduled_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return notifications;
  }

  /**
   * Mark notification as sent
   */
  static async markNotificationSent(notificationId: string) {
    await db.none('UPDATE notifications SET sent_at = NOW() WHERE id = $1', [notificationId]);
  }

  /**
   * Delete notification
   */
  static async deleteNotification(userId: string, notificationId: string) {
    const result = await db.none(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );

    return result;
  }

  /**
   * Process scheduled notifications
   * Should be called periodically (e.g., every minute via cron job)
   * In production, use a task queue or scheduler like Bull, RabbitMQ, or AWS SQS
   */
  static async processScheduledNotifications() {
    const pendingNotifications = await db.manyOrNone(
      `SELECT id, user_id, type, title, message, related_id, scheduled_at
       FROM notifications
       WHERE scheduled_at <= NOW() AND sent_at IS NULL
       LIMIT 100`
    );

    for (const notification of pendingNotifications) {
      try {
        // Get user email
        const user = await db.one('SELECT email FROM users WHERE id = $1', [notification.user_id]);

        // Send email based on type
        switch (notification.type) {
          case 'quiz_reminder':
            // Email already sent via scheduleQuizReminder, just mark as sent
            break;
          case 'exam_countdown':
            // Email already sent, just mark as sent
            break;
          case 'achievement':
            // Email already sent, just mark as sent
            break;
          case 'weekly_report':
            // Email already sent, just mark as sent
            break;
          case 'study_reminder':
            // Send generic reminder email
            await EmailService.sendEmail?.(
              user.email,
              'Study Reminder',
              `<p>${notification.message}</p>`,
              notification.message
            );
            break;
        }

        // Mark as sent
        await this.markNotificationSent(notification.id);
        console.log(`✓ Processed notification ${notification.id}`);
      } catch (error) {
        console.error(`✗ Failed to process notification ${notification.id}:`, error);
      }
    }

    return pendingNotifications.length;
  }

  /**
   * Get achievement milestones based on user progress
   * Checks for achievements like "First Flashcard", "Quiz Master", "Week Warrior", etc.
   */
  static async checkAchievements(userId: string) {
    const achievements = [];

    // Check completed items count
    const completed = await db.one<any>(
      `SELECT COUNT(*) as count FROM progress WHERE user_id = $1 AND status = 'completed'`,
      [userId]
    );

    const completedCount = parseInt(completed.count);

    if (completedCount === 1) {
      achievements.push({
        name: 'First Step',
        description: 'Completed your first learning item!',
      });
    }

    if (completedCount === 10) {
      achievements.push({
        name: 'Learning Enthusiast',
        description: 'You have completed 10 items!',
      });
    }

    if (completedCount === 50) {
      achievements.push({
        name: 'Dedicated Student',
        description: 'You have completed 50 items!',
      });
    }

    // Check quiz performance
    const avgScore = await db.one<any>(
      `SELECT AVG(score) as avg FROM quiz_results WHERE user_id = $1`,
      [userId]
    );

    const averageScore = parseFloat(avgScore.avg) || 0;

    if (averageScore >= 90) {
      achievements.push({
        name: 'Quiz Master',
        description: 'Achieved an average quiz score of 90%+',
      });
    }

    // Check study streak
    const stats = await ProgressService.getDashboardStats(userId);

    if (stats.current_streak >= 7) {
      achievements.push({
        name: 'Week Warrior',
        description: `Maintained a ${stats.current_streak}-day study streak!`,
      });
    }

    if (stats.current_streak >= 30) {
      achievements.push({
        name: 'Month Master',
        description: `You reached a ${stats.current_streak}-day study streak!`,
      });
    }

    // Schedule achievements that haven't been scheduled yet
    for (const achievement of achievements) {
      const exists = await db.oneOrNone(
        `SELECT id FROM notifications WHERE user_id = $1 AND title = $2`,
        [userId, `Achievement: ${achievement.name}`]
      );

      if (!exists) {
        await this.scheduleAchievement(userId, achievement.name, achievement.description);
      }
    }

    return achievements;
  }

  /**
   * Get user's notification preferences
   */
  static async getNotificationPreferences(userId: string) {
    const prefs = await db.oneOrNone(
      `SELECT email_quiz_reminders, email_exam_countdowns, email_weekly_reports, email_achievements
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    );

    return prefs || {
      email_quiz_reminders: true,
      email_exam_countdowns: true,
      email_weekly_reports: true,
      email_achievements: true,
    };
  }

  /**
   * Update user's notification preferences
   */
  static async updateNotificationPreferences(userId: string, preferences: Record<string, boolean>) {
    await db.none(
      `INSERT INTO user_preferences (user_id, email_quiz_reminders, email_exam_countdowns, email_weekly_reports, email_achievements)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
       email_quiz_reminders = $2,
       email_exam_countdowns = $3,
       email_weekly_reports = $4,
       email_achievements = $5`,
      [
        userId,
        preferences.email_quiz_reminders ?? true,
        preferences.email_exam_countdowns ?? true,
        preferences.email_weekly_reports ?? true,
        preferences.email_achievements ?? true,
      ]
    );
  }
}
