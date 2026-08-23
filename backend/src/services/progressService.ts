/**
 * Progress Service - Handles dashboard stats and progress calculations
 */

import { db } from '../db';

export class ProgressService {
  /**
   * Calculate dashboard statistics for user
   */
  static async getDashboardStats(userId: string) {
    // Get all subjects and their completion
    const subjectsProgress = await db.manyOrNone(
      `SELECT
        s.id,
        s.title,
        COUNT(DISTINCT p.content_id) as total_items,
        COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.content_id END) as completed_items
       FROM subjects s
       LEFT JOIN flashcards f ON s.id = f.subject_id
       LEFT JOIN progress p ON f.id = p.content_id AND p.user_id = $1 AND p.content_type = 'flashcard'
       WHERE s.is_active = true
       GROUP BY s.id, s.title
       ORDER BY s.order_index`,
      [userId]
    );

    // Calculate completion percentage per subject
    const subjectsProgressMap: Record<string, number> = {};
    for (const subject of subjectsProgress) {
      const total = parseInt(subject.total_items) || 0;
      const completed = parseInt(subject.completed_items) || 0;
      subjectsProgressMap[subject.id] = total > 0 ? Math.round((completed / total) * 100) : 0;
    }

    // Calculate total completion
    const totalStats = await db.one<any>(
      `SELECT
        COUNT(DISTINCT content_id) as total_items,
        COUNT(DISTINCT CASE WHEN status = 'completed' THEN content_id END) as completed_items
       FROM progress
       WHERE user_id = $1`,
      [userId]
    );

    const totalCompleted = parseInt(totalStats.completed_items) || 0;
    const totalItems = parseInt(totalStats.total_items) || 0;
    const totalCompletion = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

    // Get items completed this week
    const weekStats = await db.one<any>(
      `SELECT COUNT(*) as count
       FROM progress
       WHERE user_id = $1 AND status = 'completed'
       AND completed_at >= NOW() - INTERVAL '7 days'`,
      [userId]
    );

    const itemsThisWeek = parseInt(weekStats.count) || 0;

    // Calculate study streak (consecutive days with activity)
    const streak = await this.calculateStreak(userId);

    // Get next exam
    const nextExam = await db.oneOrNone(
      `SELECT ec.id, s.title, ec.exam_date,
              EXTRACT(DAY FROM ec.exam_date - NOW())::int as days_remaining
       FROM exam_calendar ec
       JOIN subjects s ON ec.subject_id = s.id
       WHERE ec.user_id = $1 AND ec.exam_date > NOW()
       ORDER BY ec.exam_date ASC
       LIMIT 1`,
      [userId]
    );

    return {
      subjects_progress: subjectsProgressMap,
      total_completion: totalCompletion,
      items_this_week: itemsThisWeek,
      current_streak: streak,
      next_exam: nextExam
        ? {
            title: nextExam.title,
            date: nextExam.exam_date,
            days_remaining: Math.max(0, nextExam.days_remaining),
          }
        : null,
    };
  }

  /**
   * Calculate current study streak (consecutive days)
   */
  private static async calculateStreak(userId: string): Promise<number> {
    const results = await db.manyOrNone(
      `SELECT DISTINCT DATE(completed_at) as day
       FROM progress
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY day DESC
       LIMIT 365`,
      [userId]
    );

    if (results.length === 0) {
      return 0;
    }

    let streak = 0;
    const today = new Date();
    let currentDate = new Date(today);
    currentDate.setHours(0, 0, 0, 0);

    for (const result of results) {
      const resultDate = new Date(result.day);
      resultDate.setHours(0, 0, 0, 0);

      const timeDiff = currentDate.getTime() - resultDate.getTime();
      const dayDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      if (dayDiff === streak) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Update progress for a content item
   */
  static async updateProgress(
    userId: string,
    contentType: string,
    contentId: string,
    status: 'not_started' | 'in_progress' | 'completed',
    score?: number
  ) {
    // Validate content_type
    const validTypes = ['flashcard', 'quiz', 'lecture', 'conspect', 'case'];
    if (!validTypes.includes(contentType)) {
      throw new Error(`Invalid content_type: ${contentType}`);
    }

    // Check if progress exists
    const existing = await db.oneOrNone(
      `SELECT id FROM progress
       WHERE user_id = $1 AND content_type = $2 AND content_id = $3`,
      [userId, contentType, contentId]
    );

    if (existing) {
      // Update existing
      await db.none(
        `UPDATE progress
         SET status = $1, score = $2, completed_at = CASE
           WHEN $1 = 'completed' THEN NOW()
           ELSE completed_at
         END, updated_at = NOW()
         WHERE user_id = $3 AND content_type = $4 AND content_id = $5`,
        [status, score || null, userId, contentType, contentId]
      );
    } else {
      // Create new
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();
      const completedAt = status === 'completed' ? new Date() : null;

      await db.none(
        `INSERT INTO progress (id, user_id, content_type, content_id, status, score, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userId, contentType, contentId, status, score || null, completedAt]
      );
    }

    return {
      user_id: userId,
      content_type: contentType,
      content_id: contentId,
      status,
      score,
      updated_at: new Date(),
    };
  }

  /**
   * Get progress for a specific subject
   */
  static async getSubjectProgress(userId: string, subjectId: string) {
    // Get all flashcard progress
    const flashcardProgress = await db.manyOrNone(
      `SELECT p.content_id, p.status, p.score
       FROM progress p
       JOIN flashcards f ON p.content_id = f.id
       WHERE p.user_id = $1 AND p.content_type = 'flashcard' AND f.subject_id = $2`,
      [userId, subjectId]
    );

    const flashcardTotal = flashcardProgress.length;
    const flashcardCompleted = flashcardProgress.filter((p) => p.status === 'completed').length;

    // Get all quiz progress
    const quizProgress = await db.manyOrNone(
      `SELECT p.content_id, p.status, p.score
       FROM progress p
       JOIN quizzes q ON p.content_id = q.id
       WHERE p.user_id = $1 AND p.content_type = 'quiz' AND q.subject_id = $2`,
      [userId, subjectId]
    );

    const quizTotal = quizProgress.length;
    const quizCompleted = quizProgress.filter((p) => p.status === 'completed').length;

    // Get all lecture progress
    const lectureProgress = await db.manyOrNone(
      `SELECT p.content_id, p.status
       FROM progress p
       JOIN lectures l ON p.content_id = l.id
       WHERE p.user_id = $1 AND p.content_type = 'lecture' AND l.subject_id = $2`,
      [userId, subjectId]
    );

    const lectureTotal = lectureProgress.length;
    const lectureCompleted = lectureProgress.filter((p) => p.status === 'completed').length;

    const totalItems = flashcardTotal + quizTotal + lectureTotal;
    const totalCompleted = flashcardCompleted + quizCompleted + lectureCompleted;
    const completionPercent = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

    return {
      subject_id: subjectId,
      completion_percentage: completionPercent,
      items_completed: totalCompleted,
      total_items: totalItems,
      breakdown: {
        flashcards: {
          completed: flashcardCompleted,
          total: flashcardTotal,
          percentage: flashcardTotal > 0 ? Math.round((flashcardCompleted / flashcardTotal) * 100) : 0,
        },
        quizzes: {
          completed: quizCompleted,
          total: quizTotal,
          percentage: quizTotal > 0 ? Math.round((quizCompleted / quizTotal) * 100) : 0,
        },
        lectures: {
          completed: lectureCompleted,
          total: lectureTotal,
          percentage: lectureTotal > 0 ? Math.round((lectureCompleted / lectureTotal) * 100) : 0,
        },
      },
    };
  }
}
