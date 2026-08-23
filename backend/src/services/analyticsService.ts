/**
 * Analytics Service - Advanced user and platform analytics
 * Provides detailed metrics and insights for admins and users
 * Integrated with caching for performance optimization
 */

import { db } from '../db';
import { CacheService } from './cacheService';
import { NotFoundError } from '../types';

export interface UserAnalytics {
  user_id: string;
  total_items_completed: number;
  total_quizzes_taken: number;
  average_quiz_score: number;
  current_streak: number;
  longestStreak: number;
  total_study_hours: number;
  subjects_completed: number;
  last_active: Date;
  learning_velocity: number; // items per day
}

export interface PlatformAnalytics {
  total_users: number;
  active_users_today: number;
  active_users_this_week: number;
  active_users_this_month: number;
  total_content_items: number;
  total_quiz_attempts: number;
  average_quiz_score: number;
  user_retention_rate: number;
  content_engagement: Record<string, number>;
}

export interface SubjectAnalytics {
  subject_id: string;
  subject_title: string;
  total_items: number;
  total_attempts: number;
  average_completion_rate: number;
  average_quiz_score: number;
  users_enrolled: number;
  most_reviewed_content: string;
  difficulty_distribution: Record<string, number>;
}

export class AnalyticsService {
  /**
   * Get comprehensive user analytics with caching
   */
  static async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    const cacheKey = CacheService.keys.userAnalytics(userId);
    const cached = CacheService.get<UserAnalytics>(cacheKey);

    if (cached) {
      return cached;
    }

    return this.computeUserAnalytics(userId);
  }

  /**
   * Compute user analytics (internal method)
   */
  private static async computeUserAnalytics(userId: string): Promise<UserAnalytics> {
    // Total items completed
    const completedItems = await db.one<any>(
      'SELECT COUNT(*) as count FROM progress WHERE user_id = $1 AND status = $2',
      [userId, 'completed']
    );

    // Quiz statistics
    const quizStats = await db.one<any>(
      `SELECT
        COUNT(*) as total,
        AVG(score) as average_score
       FROM quiz_results
       WHERE user_id = $1`,
      [userId]
    );

    // Study streak
    const streakData = await db.one<any>(
      `SELECT
        COALESCE(MAX(streak), 0) as current_streak,
        COALESCE(MAX(longest_streak), 0) as longest_streak
       FROM (
         SELECT
           COUNT(*) as streak,
           COUNT(*) as longest_streak
         FROM progress
         WHERE user_id = $1 AND status = 'completed'
       ) subq`,
      [userId]
    );

    // Total study hours
    // ПОПРАВКА: study_plan_tasks няма `user_id`. Задачата принадлежи на план,
    // а планът — на потребител, затова минаваме през study_plans.
    const studyHours = await db.one<any>(
      `SELECT COALESCE(SUM(spt.estimated_hours), 0) AS total
         FROM study_plan_tasks spt
         JOIN study_plans sp ON sp.id = spt.plan_id
        WHERE sp.user_id = $1 AND spt.status = $2`,
      [userId, 'completed']
    );

    // Subjects completed
    const subjectsCompleted = await db.one<any>(
      `SELECT COUNT(DISTINCT s.id) as count
       FROM subjects s
       JOIN progress p ON p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = s.id
         UNION
         SELECT id FROM quizzes WHERE subject_id = s.id
       )
       WHERE p.user_id = $1 AND p.status = 'completed'`,
      [userId]
    );

    // Last active
    const lastActive = await db.one<any>(
      'SELECT MAX(completed_at) as last_active FROM progress WHERE user_id = $1',
      [userId]
    );

    // Learning velocity (items per day in last 30 days)
    const velocity = await db.one<any>(
      `SELECT
        COUNT(*) as items_30_days,
        EXTRACT(DAY FROM NOW() - (
          SELECT MIN(completed_at) FROM progress
          WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days'
        )) as days_active
       FROM progress
       WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days' AND status = 'completed'`,
      [userId]
    );

    const result: UserAnalytics = {
      user_id: userId,
      total_items_completed: parseInt(completedItems.count) || 0,
      total_quizzes_taken: parseInt(quizStats.total) || 0,
      average_quiz_score: parseFloat(quizStats.average_score) || 0,
      current_streak: parseInt(streakData.current_streak) || 0,
      longestStreak: parseInt(streakData.longest_streak) || 0,
      total_study_hours: parseFloat(studyHours.total) || 0,
      subjects_completed: parseInt(subjectsCompleted.count) || 0,
      last_active: lastActive.last_active || new Date(),
      learning_velocity: velocity.days_active
        ? parseFloat((velocity.items_30_days / velocity.days_active).toFixed(2))
        : 0,
    };

    // Cache for 10 minutes
    CacheService.set(
      CacheService.keys.userAnalytics(userId),
      result,
      CacheService.ANALYTICS_TTL
    );

    return result;
  }

  /**
   * Get platform-wide analytics
   */
  static async getPlatformAnalytics(): Promise<PlatformAnalytics> {
    // Total users
    const totalUsers = await db.one<any>('SELECT COUNT(*) as count FROM users');

    // Active users today
    const activeToday = await db.one<any>(
      'SELECT COUNT(DISTINCT user_id) as count FROM progress WHERE completed_at > NOW() - INTERVAL \'1 day\''
    );

    // Active users this week
    const activeWeek = await db.one<any>(
      'SELECT COUNT(DISTINCT user_id) as count FROM progress WHERE completed_at > NOW() - INTERVAL \'7 days\''
    );

    // Active users this month
    const activeMonth = await db.one<any>(
      'SELECT COUNT(DISTINCT user_id) as count FROM progress WHERE completed_at > NOW() - INTERVAL \'30 days\''
    );

    // Total content items
    const totalContent = await db.one<any>(
      `SELECT
        (SELECT COUNT(*) FROM flashcards) +
        (SELECT COUNT(*) FROM quizzes) +
        (SELECT COUNT(*) FROM lectures) +
        (SELECT COUNT(*) FROM cases) as count`
    );

    // Quiz statistics
    const quizStats = await db.one<any>(
      `SELECT
        COUNT(*) as total_attempts,
        AVG(score) as average_score
       FROM quiz_results`
    );

    // User retention (users active in last 7 days vs total)
    const retentionRate =
      (parseInt(activeWeek.count) / Math.max(parseInt(totalUsers.count), 1)) * 100;

    // Content engagement by type
    const contentEngagement: Record<string, number> = {};

    const flashcardEngagement = await db.one<any>(
      'SELECT COUNT(*) as count FROM progress WHERE content_type = $1',
      ['flashcard']
    );
    contentEngagement.flashcards = parseInt(flashcardEngagement.count) || 0;

    const quizEngagement = await db.one<any>(
      'SELECT COUNT(*) as count FROM progress WHERE content_type = $1',
      ['quiz']
    );
    contentEngagement.quizzes = parseInt(quizEngagement.count) || 0;

    const lectureEngagement = await db.one<any>(
      'SELECT COUNT(*) as count FROM progress WHERE content_type = $1',
      ['lecture']
    );
    contentEngagement.lectures = parseInt(lectureEngagement.count) || 0;

    const caseEngagement = await db.one<any>(
      'SELECT COUNT(*) as count FROM progress WHERE content_type = $1',
      ['case']
    );
    contentEngagement.cases = parseInt(caseEngagement.count) || 0;

    return {
      total_users: parseInt(totalUsers.count) || 0,
      active_users_today: parseInt(activeToday.count) || 0,
      active_users_this_week: parseInt(activeWeek.count) || 0,
      active_users_this_month: parseInt(activeMonth.count) || 0,
      total_content_items: parseInt(totalContent.count) || 0,
      total_quiz_attempts: parseInt(quizStats.total_attempts) || 0,
      average_quiz_score: parseFloat(quizStats.average_score) || 0,
      user_retention_rate: parseFloat(retentionRate.toFixed(2)),
      content_engagement: contentEngagement,
    };
  }

  /**
   * Get subject-specific analytics
   */
  static async getSubjectAnalytics(subjectId: string): Promise<SubjectAnalytics> {
    // Get subject info
    // ПОПРАВКА: `db.one` хвърляше „No data returned from the query“ (500) за
    // непознат предмет, а проверката отдолу дори не се стигаше. Липсващ
    // предмет е 404, затова `oneOrNone` + NotFoundError.
    const subject = await db.oneOrNone<any>('SELECT id, title FROM subjects WHERE id = $1', [
      subjectId,
    ]);

    if (!subject) {
      throw new NotFoundError('Предметът не е намерен');
    }

    // Total items
    const totalItems = await db.one<any>(
      `SELECT
        (SELECT COUNT(*) FROM flashcards WHERE subject_id = $1) +
        (SELECT COUNT(*) FROM quizzes WHERE subject_id = $1) +
        (SELECT COUNT(*) FROM lectures WHERE subject_id = $1) +
        (SELECT COUNT(*) FROM cases WHERE subject_id = $1) as count`,
      [subjectId]
    );

    // Total attempts and average completion rate
    const attempts = await db.one<any>(
      `SELECT
        COUNT(*) as total_attempts,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM progress p
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION
         SELECT id FROM lectures WHERE subject_id = $1
         UNION
         SELECT id FROM cases WHERE subject_id = $1
       )`,
      [subjectId]
    );

    const completionRate =
      parseInt(attempts.total_attempts) > 0
        ? (parseInt(attempts.completed) / parseInt(attempts.total_attempts)) * 100
        : 0;

    // Quiz score for this subject
    const quizScore = await db.one<any>(
      `SELECT AVG(qr.score) as average_score
       FROM quiz_results qr
       JOIN quizzes q ON qr.quiz_id = q.id
       WHERE q.subject_id = $1`,
      [subjectId]
    );

    // Users enrolled (taken any content from this subject)
    const usersEnrolled = await db.one<any>(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM progress p
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION
         SELECT id FROM lectures WHERE subject_id = $1
         UNION
         SELECT id FROM cases WHERE subject_id = $1
       )`,
      [subjectId]
    );

    // Most reviewed content (by type)
    // ПОПРАВКА: заявката е с GROUP BY и LIMIT 1 — при нула прегледи не връща
    // нито ред и `db.one` гърмеше. Кодът долу и без това чете с `?.`.
    const mostReviewed = await db.oneOrNone<any>(
      `SELECT content_type, COUNT(*) as count
       FROM progress p
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION
         SELECT id FROM lectures WHERE subject_id = $1
         UNION
         SELECT id FROM cases WHERE subject_id = $1
       )
       GROUP BY content_type
       ORDER BY count DESC
       LIMIT 1`,
      [subjectId]
    );

    // Difficulty distribution for flashcards
    const difficultyDist = await db.manyOrNone<any>(
      `SELECT difficulty, COUNT(*) as count
       FROM flashcards
       WHERE subject_id = $1
       GROUP BY difficulty`,
      [subjectId]
    );

    const difficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    difficultyDist.forEach((d: any) => {
      difficulty[d.difficulty] = parseInt(d.count);
    });

    return {
      subject_id: subjectId,
      subject_title: subject.title,
      total_items: parseInt(totalItems.count) || 0,
      total_attempts: parseInt(attempts.total_attempts) || 0,
      average_completion_rate: parseFloat(completionRate.toFixed(2)),
      average_quiz_score: parseFloat(quizScore.average_score) || 0,
      users_enrolled: parseInt(usersEnrolled.count) || 0,
      most_reviewed_content: mostReviewed?.content_type || 'unknown',
      difficulty_distribution: difficulty,
    };
  }

  /**
   * Get performance trends over time
   */
  static async getPerformanceTrends(
    userId: string,
    days: number = 30
  ): Promise<Array<{ date: string; completed_items: number; average_score: number }>> {
    // ПОПРАВКА: и progress, и quiz_results имат колона `completed_at`, затова
    // неквалифицираното `completed_at` даваше „column reference is ambiguous“.
    // Търсим датата на прогреса — квалифицираме всичко с псевдонима `p`.
    const trends = await db.manyOrNone<any>(
      `SELECT
        DATE(p.completed_at) as date,
        COUNT(*) as completed_items,
        AVG(qr.score) as average_score
       FROM progress p
       LEFT JOIN quiz_results qr ON p.user_id = qr.user_id
       WHERE p.user_id = $1
       AND p.completed_at > NOW() - INTERVAL '${days} days'
       AND p.status = 'completed'
       GROUP BY DATE(p.completed_at)
       ORDER BY date ASC`,
      [userId]
    );

    return trends.map((t: any) => ({
      date: t.date,
      completed_items: parseInt(t.completed_items),
      average_score: parseFloat(t.average_score) || 0,
    }));
  }

  /**
   * Get learning path recommendations based on performance
   */
  static async getLearningRecommendations(userId: string): Promise<Array<{
    subject_id: string;
    subject_title: string;
    completion_rate: number;
    recommended_action: string;
  }>> {
    const recommendations = await db.manyOrNone<any>(
      `SELECT
        s.id,
        s.title,
        ROUND(100.0 * SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) /
          NULLIF(COUNT(*), 0), 2) as completion_rate
       FROM subjects s
       LEFT JOIN (
         SELECT DISTINCT subject_id, $1 as user_id
         FROM flashcards
         UNION
         SELECT DISTINCT subject_id, $1 as user_id
         FROM quizzes
         UNION
         SELECT DISTINCT subject_id, $1 as user_id
         FROM lectures
         UNION
         SELECT DISTINCT subject_id, $1 as user_id
         FROM cases
       ) content ON s.id = content.subject_id
       LEFT JOIN progress p ON (
         p.user_id = $1 AND
         p.content_id IN (
           SELECT id FROM flashcards WHERE subject_id = s.id
           UNION
           SELECT id FROM quizzes WHERE subject_id = s.id
           UNION
           SELECT id FROM lectures WHERE subject_id = s.id
           UNION
           SELECT id FROM cases WHERE subject_id = s.id
         )
       )
       GROUP BY s.id, s.title
       ORDER BY completion_rate ASC`,
      [userId]
    );

    return recommendations.map((r: any) => {
      let action = 'Continue studying';
      if (r.completion_rate < 25) action = 'Start new subject';
      else if (r.completion_rate < 75) action = 'Complete remaining items';
      else if (r.completion_rate < 100) action = 'Finish this subject';
      else action = 'Master this subject';

      return {
        subject_id: r.id,
        subject_title: r.title,
        completion_rate: parseFloat(r.completion_rate) || 0,
        recommended_action: action,
      };
    });
  }
}
