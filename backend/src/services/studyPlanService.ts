/**
 * Study Plan Service - Generates and manages personalized study plans
 * Algorithm: Distributes content based on exam date, user progress, and available time
 */

import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError } from '../types';

export interface StudyPlanTask {
  id: string;
  date: Date;
  title: string;
  status: 'upcoming' | 'in_progress' | 'completed' | 'skipped';
  content_type: string;
  content_id: string;
  estimated_hours: number;
}

export class StudyPlanService {
  /**
   * Generate personalized study plan for user
   * Algorithm:
   * 1. Get all incomplete items across all subjects
   * 2. Calculate days until exam
   * 3. Distribute items evenly across days
   * 4. Prioritize incomplete content
   * 5. Adjust for difficulty and estimated time
   */
  static async generateStudyPlan(userId: string, examDate: Date, subjectIds?: string[]): Promise<string> {
    // Validate exam date is in future
    if (examDate <= new Date()) {
      throw new ValidationError('Exam date must be in the future');
    }

    // Delete existing plan if any
    const existingPlan = await db.oneOrNone(
      'SELECT id FROM study_plans WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (existingPlan) {
      await db.none('UPDATE study_plans SET is_active = false WHERE id = $1', [existingPlan.id]);
    }

    // Create new study plan
    const planId = uuidv4();
    await db.none(
      `INSERT INTO study_plans (id, user_id, exam_date, is_active)
       VALUES ($1, $2, $3, true)`,
      [planId, userId, examDate]
    );

    // Calculate days until exam
    const now = new Date();
    const daysUntilExam = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExam < 1) {
      throw new ValidationError('Exam must be at least 1 day away');
    }

    // Get all incomplete content
    const subjectFilter = subjectIds && subjectIds.length > 0 ? `WHERE s.id = ANY($1)` : '';
    const params: any[] = subjectIds && subjectIds.length > 0 ? [subjectIds] : [];

    const incompleteFlashcards = await db.manyOrNone(
      `SELECT 'flashcard' as type, f.id as content_id, f.subject_id, 'Flashcard: ' || f.question as title, 0.25 as hours
       FROM flashcards f
       LEFT JOIN progress p ON f.id = p.content_id AND p.user_id = $1 AND p.content_type = 'flashcard'
       WHERE p.id IS NULL OR p.status != 'completed'
       ${subjectFilter}
       ORDER BY f.difficulty ASC
       LIMIT 500`,
      subjectIds ? [userId, ...params] : [userId]
    );

    const incompleteQuizzes = await db.manyOrNone(
      `SELECT 'quiz' as type, q.id as content_id, q.subject_id, q.title, 1.5 as hours
       FROM quizzes q
       LEFT JOIN progress p ON q.id = p.content_id AND p.user_id = $1 AND p.content_type = 'quiz'
       WHERE p.id IS NULL OR p.status != 'completed'
       ${subjectFilter}
       LIMIT 100`,
      subjectIds ? [userId, ...params] : [userId]
    );

    const incompleteLectures = await db.manyOrNone(
      `SELECT 'lecture' as type, l.id as content_id, l.subject_id, l.title,
              CASE WHEN l.duration IS NOT NULL THEN l.duration::float/60 ELSE 1.0 END as hours
       FROM lectures l
       LEFT JOIN progress p ON l.id = p.content_id AND p.user_id = $1 AND p.content_type = 'lecture'
       WHERE p.id IS NULL OR p.status != 'completed'
       ${subjectFilter}
       LIMIT 100`,
      subjectIds ? [userId, ...params] : [userId]
    );

    const incompleteCases = await db.manyOrNone(
      `SELECT 'case' as type, c.id as content_id, c.subject_id, c.title, 0.75 as hours
       FROM cases c
       LEFT JOIN progress p ON c.id = p.content_id AND p.user_id = $1 AND p.content_type = 'case'
       WHERE p.id IS NULL OR p.status != 'completed'
       ${subjectFilter}
       LIMIT 200`,
      subjectIds ? [userId, ...params] : [userId]
    );

    const allItems = [
      ...incompleteFlashcards,
      ...incompleteQuizzes,
      ...incompleteLectures,
      ...incompleteCases,
    ];

    if (allItems.length === 0) {
      throw new ValidationError('No incomplete content found');
    }

    // Calculate total hours needed
    const totalHours = allItems.reduce((sum, item) => sum + parseFloat(item.hours || 0), 0);
    const availableHoursPerDay = 2; // Conservative estimate
    const daysNeeded = Math.ceil(totalHours / availableHoursPerDay);

    // Adjust if not enough days
    const hoursPerDay = Math.max(availableHoursPerDay, Math.ceil(totalHours / daysUntilExam));

    // Distribute items across days
    let currentDay = new Date(now);
    currentDay.setHours(0, 0, 0, 0);
    let dayCounter = 0;
    let hoursAccumulated = 0;

    const tasks: any[] = [];

    for (const item of allItems) {
      const itemHours = parseFloat(item.hours || 1);

      // Move to next day if accumulated hours exceed daily limit
      if (hoursAccumulated + itemHours > hoursPerDay) {
        currentDay.setDate(currentDay.getDate() + 1);
        hoursAccumulated = 0;
        dayCounter++;
      }

      // Skip if beyond exam date
      if (dayCounter >= daysUntilExam) {
        break;
      }

      const taskId = uuidv4();
      tasks.push({
        id: taskId,
        plan_id: planId,
        date: new Date(currentDay),
        title: item.title,
        status: 'upcoming',
        content_type: item.type,
        content_id: item.content_id,
        estimated_hours: itemHours,
      });

      hoursAccumulated += itemHours;
    }

    // Insert all tasks
    for (const task of tasks) {
      await db.none(
        `INSERT INTO study_plan_tasks
         (id, plan_id, date, title, status, content_type, content_id, estimated_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          task.id,
          task.plan_id,
          task.date,
          task.title,
          task.status,
          task.content_type,
          task.content_id,
          task.estimated_hours,
        ]
      );
    }

    return planId;
  }

  /**
   * Get user's study plan with tasks
   */
  static async getStudyPlan(userId: string) {
    const plan = await db.oneOrNone(
      `SELECT id, exam_date, created_at, updated_at
       FROM study_plans
       WHERE user_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!plan) {
      return null;
    }

    const tasks = await db.manyOrNone(
      `SELECT id, date, title, status, content_type, content_id, estimated_hours
       FROM study_plan_tasks
       WHERE plan_id = $1
       ORDER BY date ASC`,
      [plan.id]
    );

    // Group tasks by date
    const groupedByDate: Record<string, any[]> = {};
    for (const task of tasks) {
      const dateKey = new Date(task.date).toISOString().split('T')[0];
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey].push(task);
    }

    return {
      ...plan,
      days: Object.entries(groupedByDate).map(([date, dayTasks]) => ({
        date,
        tasks: dayTasks,
        total_hours: dayTasks.reduce((sum, t) => sum + t.estimated_hours, 0),
        completed_count: dayTasks.filter((t) => t.status === 'completed').length,
        total_count: dayTasks.length,
      })),
    };
  }

  /**
   * Get today's focus tasks
   */
  static async getTodayFocus(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasks = await db.manyOrNone(
      `SELECT spt.id, spt.title, spt.status, spt.estimated_hours,
              spt.content_type, spt.content_id
       FROM study_plan_tasks spt
       JOIN study_plans sp ON spt.plan_id = sp.id
       WHERE sp.user_id = $1 AND DATE(spt.date) = DATE($2)
       ORDER BY spt.created_at ASC`,
      [userId, today]
    );

    if (tasks.length === 0) {
      return null;
    }

    // Get highest priority task (first incomplete)
    const focusTask = tasks.find((t) => t.status !== 'completed') || tasks[0];

    return {
      focus_task: focusTask,
      all_today: tasks,
      completed_today: tasks.filter((t) => t.status === 'completed').length,
      total_today: tasks.length,
    };
  }

  /**
   * Reschedule task to different date
   */
  static async rescheduleTask(userId: string, taskId: string, newDate: Date): Promise<void> {
    // Verify task belongs to user's plan
    const task = await db.oneOrNone(
      `SELECT spt.id FROM study_plan_tasks spt
       JOIN study_plans sp ON spt.plan_id = sp.id
       WHERE spt.id = $1 AND sp.user_id = $2`,
      [taskId, userId]
    );

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    await db.none('UPDATE study_plan_tasks SET date = $1, updated_at = NOW() WHERE id = $2', [
      newDate,
      taskId,
    ]);
  }

  /**
   * Get plan statistics
   */
  static async getPlanStats(userId: string) {
    const stats = await db.one<any>(
      `SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
        SUM(estimated_hours) as total_hours,
        SUM(CASE WHEN status = 'completed' THEN estimated_hours ELSE 0 END) as hours_completed
       FROM study_plan_tasks spt
       JOIN study_plans sp ON spt.plan_id = sp.id
       WHERE sp.user_id = $1 AND sp.is_active = true`,
      [userId]
    );

    const totalTasks = parseInt(stats.total_tasks) || 0;
    const completedTasks = parseInt(stats.completed_tasks) || 0;

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      in_progress_tasks: parseInt(stats.in_progress_tasks) || 0,
      total_hours: parseFloat(stats.total_hours) || 0,
      hours_completed: parseFloat(stats.hours_completed) || 0,
      completion_percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  }
}
