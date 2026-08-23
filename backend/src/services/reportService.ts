/**
 * Report Service - Advanced reporting and insights
 * Provides detailed reports, trends analysis, and predictive insights
 */

import { db } from '../db';
import { NotFoundError } from '../types';

export interface UserReport {
  user_id: string;
  email: string;
  total_study_time_hours: number;
  average_daily_active: number;
  total_subjects_enrolled: number;
  completion_rate_overall: number;
  strongest_subject: string;
  weakest_subject: string;
  learning_trend: 'improving' | 'stable' | 'declining';
  predicted_exam_score: number;
  risk_level: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface SubjectReport {
  subject_id: string;
  subject_title: string;
  total_students: number;
  average_completion_rate: number;
  average_quiz_score: number;
  student_performance_distribution: {
    excellent: number; // 80-100
    good: number; // 60-79
    fair: number; // 40-59
    poor: number; // <40
  };
  content_effectiveness: {
    type: string;
    engagement_rate: number;
    average_score: number;
  }[];
  time_to_complete: {
    median_hours: number;
    min_hours: number;
    max_hours: number;
  };
  recommendations: string[];
}

export interface CohortReport {
  cohort_name: string;
  start_date: string;
  total_students: number;
  completion_rate: number;
  average_score: number;
  retention_rate: number;
  active_students: number;
  inactive_students: number;
  at_risk_students: number;
  top_performers: Array<{
    user_id: string;
    email: string;
    average_score: number;
  }>;
  bottom_performers: Array<{
    user_id: string;
    email: string;
    average_score: number;
  }>;
}

export class ReportService {
  /**
   * Generate comprehensive user report
   */
  static async generateUserReport(userId: string): Promise<UserReport> {
    // User info
    // ПОПРАВКА: `db.one` вдигаше „No data returned from the query“ (500) за
    // непознат потребител — проверката отдолу изобщо не се стигаше.
    // Липсващ потребител е 404, затова `oneOrNone` + NotFoundError.
    const user = await db.oneOrNone<any>('SELECT id, email FROM users WHERE id = $1', [userId]);

    if (!user) {
      throw new NotFoundError('Потребителят не е намерен');
    }

    // Study time and activity
    const studyStats = await db.one<any>(
      `SELECT
        COALESCE(SUM(EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/3600), 0) as total_hours,
        COUNT(DISTINCT DATE(p.completed_at)) as days_active,
        COUNT(DISTINCT DATE(p.completed_at)) as active_days_count
       FROM progress p
       WHERE p.user_id = $1 AND p.status = 'completed'`,
      [userId]
    );

    // Subjects and enrollment
    const subjectStats = await db.any<any>(
      `SELECT DISTINCT
        s.id,
        s.title,
        ROUND(100.0 * SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) /
          NULLIF(COUNT(p.id), 0), 2) as completion_rate,
        COALESCE(AVG(qr.score), 0) as avg_score
       FROM subjects s
       LEFT JOIN (
         SELECT subject_id, id FROM flashcards
         UNION ALL
         SELECT subject_id, id FROM quizzes
         UNION ALL
         SELECT subject_id, id FROM lectures
         UNION ALL
         SELECT subject_id, id FROM cases
       ) content ON s.id = content.subject_id
       LEFT JOIN progress p ON p.content_id = content.id AND p.user_id = $1
       LEFT JOIN quiz_results qr ON qr.user_id = $1 AND qr.quiz_id = content.id
       GROUP BY s.id, s.title
       HAVING COUNT(p.id) > 0 OR COUNT(qr.id) > 0
       ORDER BY completion_rate DESC`,
      [userId]
    );

    // Overall completion rate
    const completionStats = await db.one<any>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM progress
       WHERE user_id = $1`,
      [userId]
    );

    const overallCompletion = (parseInt(completionStats.completed) / parseInt(completionStats.total)) * 100 || 0;

    // Quiz performance
    const quizStats = await db.one<any>(
      `SELECT
        AVG(score) as avg_score,
        STDDEV(score) as score_stddev,
        COUNT(*) as quiz_count
       FROM quiz_results
       WHERE user_id = $1`,
      [userId]
    );

    // Recent trends (last 30 days vs previous 30 days)
    const recentProgress = await db.one<any>(
      `SELECT COUNT(*) as count FROM progress WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '30 days' AND status = 'completed'`,
      [userId]
    );

    const previousProgress = await db.one<any>(
      `SELECT COUNT(*) as count FROM progress WHERE user_id = $1 AND completed_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND status = 'completed'`,
      [userId]
    );

    const recentCount = parseInt(recentProgress.count) || 0;
    const previousCount = parseInt(previousProgress.count) || 0;
    let learningTrend: 'improving' | 'stable' | 'declining' = 'stable';

    if (recentCount > previousCount * 1.1) learningTrend = 'improving';
    else if (recentCount < previousCount * 0.9) learningTrend = 'declining';

    // Risk assessment
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (overallCompletion < 30) riskLevel = 'high';
    else if (overallCompletion < 60) riskLevel = 'medium';

    // Average daily active (engaged days / total days)
    const daysSinceJoined = await db.one<any>(
      `SELECT EXTRACT(DAY FROM NOW() - created_at) as days FROM users WHERE id = $1`,
      [userId]
    );

    const activeDays = studyStats.active_days_count || 0;
    const totalDays = Math.max(parseInt(daysSinceJoined.days) || 1, 1);
    const averageDailyActive = (activeDays / totalDays) * 100;

    // Strongest and weakest subjects
    const strongestSubject = subjectStats[0]?.title || 'N/A';
    const weakestSubject = subjectStats[subjectStats.length - 1]?.title || 'N/A';

    // Predicted exam score (based on quiz average and completion rate)
    const predictedScore = Math.min(
      100,
      Math.round((quizStats.avg_score || 0) * 0.7 + (overallCompletion / 100) * 30)
    );

    // Generate recommendations
    const recommendations: string[] = [];

    if (riskLevel === 'high') {
      recommendations.push('You need to increase your study frequency to catch up.');
    } else if (riskLevel === 'medium') {
      recommendations.push('Try to dedicate more time to challenging subjects.');
    }

    if (learningTrend === 'declining') {
      recommendations.push('Your learning velocity is decreasing. Consider setting study goals.');
    } else if (learningTrend === 'improving') {
      recommendations.push('Great progress! Keep up the momentum.');
    }

    if (subjectStats.length > 0 && subjectStats[subjectStats.length - 1].completion_rate < 30) {
      recommendations.push(`Focus on ${weakestSubject} - you have the most room for improvement there.`);
    }

    if (quizStats.quiz_count > 0 && quizStats.avg_score < 60) {
      recommendations.push('Practice more quizzes to improve your scoring performance.');
    }

    if (averageDailyActive < 20) {
      recommendations.push('Increase consistency - even 15 minutes per day makes a big difference.');
    }

    return {
      user_id: userId,
      email: user.email,
      total_study_time_hours: Math.round(studyStats.total_hours),
      average_daily_active: Math.round(averageDailyActive * 10) / 10,
      total_subjects_enrolled: subjectStats.length,
      completion_rate_overall: Math.round(overallCompletion * 10) / 10,
      strongest_subject: strongestSubject,
      weakest_subject: weakestSubject,
      learning_trend: learningTrend,
      predicted_exam_score: predictedScore,
      risk_level: riskLevel,
      recommendations,
    };
  }

  /**
   * Generate comprehensive subject report
   */
  static async generateSubjectReport(subjectId: string): Promise<SubjectReport> {
    // Subject info
    // ПОПРАВКА: същият случай — `db.one` върху непознат предмет даваше 500.
    const subject = await db.oneOrNone<any>('SELECT id, title FROM subjects WHERE id = $1', [subjectId]);

    if (!subject) {
      throw new NotFoundError('Предметът не е намерен');
    }

    // Student stats
    const studentStats = await db.one<any>(
      `SELECT COUNT(DISTINCT user_id) as total_students
       FROM progress p
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION ALL
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION ALL
         SELECT id FROM lectures WHERE subject_id = $1
         UNION ALL
         SELECT id FROM cases WHERE subject_id = $1
       )`,
      [subjectId]
    );

    // Overall stats
    const overallStats = await db.one<any>(
      `SELECT
        ROUND(100.0 * SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) /
          NULLIF(COUNT(p.id), 0), 2) as completion_rate,
        AVG(qr.score) as avg_quiz_score,
        COUNT(DISTINCT p.user_id) as unique_students
       FROM progress p
       LEFT JOIN quiz_results qr ON qr.user_id = p.user_id
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION ALL
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION ALL
         SELECT id FROM lectures WHERE subject_id = $1
         UNION ALL
         SELECT id FROM cases WHERE subject_id = $1
       )`,
      [subjectId]
    );

    // Performance distribution
    const scoreDistribution = await db.any<any>(
      `SELECT
        CASE
          WHEN qr.score >= 80 THEN 'excellent'
          WHEN qr.score >= 60 THEN 'good'
          WHEN qr.score >= 40 THEN 'fair'
          ELSE 'poor'
        END as category,
        COUNT(*) as count
       FROM quiz_results qr
       JOIN quizzes q ON qr.quiz_id = q.id
       WHERE q.subject_id = $1
       GROUP BY category`,
      [subjectId]
    );

    const distribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
    scoreDistribution.forEach((row: any) => {
      distribution[row.category as keyof typeof distribution] = parseInt(row.count);
    });

    // Content effectiveness by type
    const contentEffectiveness = await db.any<any>(
      `SELECT
        p.content_type,
        ROUND(100.0 * SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) /
          NULLIF(COUNT(p.id), 0), 2) as engagement_rate,
        COALESCE(AVG(qr.score), 0) as average_score
       FROM progress p
       LEFT JOIN quiz_results qr ON qr.user_id = p.user_id
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION ALL
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION ALL
         SELECT id FROM lectures WHERE subject_id = $1
         UNION ALL
         SELECT id FROM cases WHERE subject_id = $1
       )
       GROUP BY p.content_type
       ORDER BY engagement_rate DESC`,
      [subjectId]
    );

    // Time to complete
    const timeStats = await db.one<any>(
      `SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/3600) as median,
        MIN(EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/3600) as min,
        MAX(EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/3600) as max
       FROM progress p
       WHERE p.content_id IN (
         SELECT id FROM flashcards WHERE subject_id = $1
         UNION ALL
         SELECT id FROM quizzes WHERE subject_id = $1
         UNION ALL
         SELECT id FROM lectures WHERE subject_id = $1
         UNION ALL
         SELECT id FROM cases WHERE subject_id = $1
       ) AND p.status = 'completed'`,
      [subjectId]
    );

    // Recommendations
    const recommendations: string[] = [];

    if (parseFloat(overallStats.completion_rate) < 50) {
      recommendations.push('Low completion rate - consider breaking content into smaller chunks.');
    }

    if (parseFloat(overallStats.avg_quiz_score) < 60) {
      recommendations.push('Average quiz score is below 60% - content may need clarification.');
    }

    if (distribution.poor > distribution.excellent) {
      recommendations.push('More students are scoring poorly than excellently - review difficult topics.');
    }

    if (contentEffectiveness[0]?.engagement_rate < 40) {
      recommendations.push('Low engagement with primary content type - consider alternative formats.');
    }

    return {
      subject_id: subjectId,
      subject_title: subject.title,
      total_students: parseInt(studentStats.total_students),
      average_completion_rate: parseFloat(overallStats.completion_rate) || 0,
      average_quiz_score: Math.round(parseFloat(overallStats.avg_quiz_score) || 0),
      student_performance_distribution: distribution,
      content_effectiveness: contentEffectiveness.map((row: any) => ({
        type: row.content_type,
        engagement_rate: parseFloat(row.engagement_rate) || 0,
        average_score: Math.round(parseFloat(row.average_score) || 0),
      })),
      time_to_complete: {
        median_hours: Math.round(timeStats.median || 0),
        min_hours: Math.round(timeStats.min || 0),
        max_hours: Math.round(timeStats.max || 0),
      },
      recommendations,
    };
  }

  /**
   * Generate cohort performance report
   */
  static async generateCohortReport(cohortName?: string): Promise<CohortReport> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const totalStudents = await db.one<any>('SELECT COUNT(*) as count FROM users WHERE role = $1', ['student']);

    const completionStats = await db.one<any>(
      `SELECT
        ROUND(100.0 * SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) /
          NULLIF(COUNT(p.id), 0), 2) as completion_rate
       FROM progress p`
    );

    const quizStats = await db.one<any>(`SELECT AVG(score) as avg_score FROM quiz_results`);

    const retentionStats = await db.one<any>(
      `SELECT
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '7 days') as active,
        COUNT(DISTINCT user_id) as total
       FROM progress`
    );

    const retention = (parseInt(retentionStats.active) / parseInt(retentionStats.total)) * 100 || 0;

    // At-risk students (low completion rate)
    const atRiskStudents = await db.any<any>(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM progress p
       WHERE (
         SELECT ROUND(100.0 * SUM(CASE WHEN p2.status = 'completed' THEN 1 ELSE 0 END) /
           NULLIF(COUNT(p2.id), 0), 2)
         FROM progress p2
         WHERE p2.user_id = p.user_id
       ) < 30`
    );

    // Top performers
    const topPerformers = await db.any<any>(
      `SELECT
        u.id,
        u.email,
        AVG(qr.score) as avg_score
       FROM users u
       JOIN quiz_results qr ON u.id = qr.user_id
       GROUP BY u.id, u.email
       ORDER BY avg_score DESC
       LIMIT 5`
    );

    // Bottom performers
    const bottomPerformers = await db.any<any>(
      `SELECT
        u.id,
        u.email,
        AVG(qr.score) as avg_score
       FROM users u
       JOIN quiz_results qr ON u.id = qr.user_id
       GROUP BY u.id, u.email
       ORDER BY avg_score ASC
       LIMIT 5`
    );

    return {
      cohort_name: cohortName || 'All Students',
      start_date: startDate.toISOString(),
      total_students: parseInt(totalStudents.count),
      completion_rate: parseFloat(completionStats.completion_rate) || 0,
      average_score: Math.round(parseFloat(quizStats.avg_score) || 0),
      retention_rate: Math.round(retention * 10) / 10,
      active_students: parseInt(retentionStats.active),
      inactive_students: parseInt(retentionStats.total) - parseInt(retentionStats.active),
      at_risk_students: parseInt(atRiskStudents[0]?.count) || 0,
      top_performers: topPerformers.map((p: any) => ({
        user_id: p.id,
        email: p.email,
        average_score: Math.round(parseFloat(p.avg_score)),
      })),
      bottom_performers: bottomPerformers.map((p: any) => ({
        user_id: p.id,
        email: p.email,
        average_score: Math.round(parseFloat(p.avg_score)),
      })),
    };
  }
}
