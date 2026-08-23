/**
 * Quiz Service - Handles quiz logic, scoring, and result tracking
 */

import { db } from '../db';
import { NotFoundError, ValidationError } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class QuizService {
  /**
   * Get quiz with all questions
   */
  static async getQuizWithQuestions(quizId: string) {
    const quiz = await db.oneOrNone(
      'SELECT id, title, description, subject_id FROM quizzes WHERE id = $1',
      [quizId]
    );

    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }

    const questions = await db.manyOrNone(
      `SELECT id, question, option_a, option_b, option_c, option_d
       FROM quiz_questions
       WHERE quiz_id = $1
       ORDER BY created_at`,
      [quizId]
    );

    return {
      ...quiz,
      questions,
      question_count: questions.length,
    };
  }

  /**
   * Submit quiz answers and calculate score
   */
  static async submitQuiz(
    userId: string,
    quizId: string,
    answers: Record<string, string>
  ) {
    // Validate quiz exists
    const quiz = await db.oneOrNone(
      'SELECT id FROM quizzes WHERE id = $1',
      [quizId]
    );

    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }

    // Get all quiz questions
    const questions = await db.manyOrNone<{
      id: string;
      correct_answer: string;
      explanation: string;
    }>(
      `SELECT id, correct_answer, explanation
       FROM quiz_questions
       WHERE quiz_id = $1`,
      [quizId]
    );

    if (questions.length === 0) {
      throw new ValidationError('Quiz has no questions');
    }

    // Calculate score
    let correctCount = 0;
    const detailedResults = [];

    for (const question of questions) {
      const userAnswer = answers[question.id];
      const isCorrect = userAnswer === question.correct_answer;

      if (isCorrect) {
        correctCount++;
      }

      detailedResults.push({
        question_id: question.id,
        user_answer: userAnswer || null,
        correct_answer: question.correct_answer,
        is_correct: isCorrect,
        explanation: question.explanation,
      });
    }

    const wrongCount = questions.length - correctCount;
    const score = Math.round((correctCount / questions.length) * 100);

    // Save quiz result
    const resultId = uuidv4();
    const now = new Date();

    await db.none(
      `INSERT INTO quiz_results
       (id, user_id, quiz_id, score, correct_count, wrong_count, answers, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        resultId,
        userId,
        quizId,
        score,
        correctCount,
        wrongCount,
        JSON.stringify(detailedResults),
        now,
      ]
    );

    // Update user progress
    await this.updateProgress(userId, 'quiz', quizId, 'completed', score);

    return {
      result_id: resultId,
      quiz_id: quizId,
      score,
      percentage: score,
      correct_count: correctCount,
      wrong_count: wrongCount,
      total_questions: questions.length,
      passed: score >= 70,
      detailed_results: detailedResults,
      completed_at: now,
    };
  }

  /**
   * Get user's quiz result
   */
  static async getUserQuizResult(userId: string, quizId: string) {
    const result = await db.oneOrNone(
      `SELECT *
       FROM quiz_results
       WHERE quiz_id = $1 AND user_id = $2
       ORDER BY completed_at DESC
       LIMIT 1`,
      [quizId, userId]
    );

    if (!result) {
      throw new NotFoundError('Quiz result not found');
    }

    // Parse answers JSON
    return {
      ...result,
      answers: result.answers ? JSON.parse(result.answers) : [],
    };
  }

  /**
   * Get user's quiz history (all attempts)
   */
  static async getUserQuizHistory(userId: string, limit: number = 20, offset: number = 0) {
    const results = await db.manyOrNone(
      `SELECT qr.id, qr.quiz_id, qr.score, qr.correct_count, qr.wrong_count,
              qr.completed_at, q.title
       FROM quiz_results qr
       JOIN quizzes q ON qr.quiz_id = q.id
       WHERE qr.user_id = $1
       ORDER BY qr.completed_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = await db.one<{ count: number }>(
      'SELECT COUNT(*) as count FROM quiz_results WHERE user_id = $1',
      [userId]
    );

    return {
      items: results,
      total: total.count,
      limit,
      offset,
    };
  }

  /**
   * Get quiz statistics for a user
   */
  static async getQuizStats(userId: string, subjectId?: string) {
    let query = `
      SELECT
        COUNT(*) as total_attempts,
        AVG(score) as average_score,
        MAX(score) as best_score,
        COUNT(CASE WHEN score >= 70 THEN 1 END) as passed_count,
        COUNT(CASE WHEN score < 70 THEN 1 END) as failed_count
      FROM quiz_results qr
      JOIN quizzes q ON qr.quiz_id = q.id
      WHERE qr.user_id = $1
    `;

    const params: any[] = [userId];

    if (subjectId) {
      query += ` AND q.subject_id = $2`;
      params.push(subjectId);
    }

    const stats = await db.one(query, params);

    return {
      total_attempts: parseInt(stats.total_attempts) || 0,
      average_score: Math.round(parseFloat(stats.average_score) || 0),
      best_score: parseInt(stats.best_score) || 0,
      passed_count: parseInt(stats.passed_count) || 0,
      failed_count: parseInt(stats.failed_count) || 0,
      pass_rate:
        stats.total_attempts > 0
          ? Math.round((parseInt(stats.passed_count) / parseInt(stats.total_attempts)) * 100)
          : 0,
    };
  }

  /**
   * Internal: Update progress record
   */
  private static async updateProgress(
    userId: string,
    contentType: string,
    contentId: string,
    status: string,
    score?: number
  ) {
    const existingProgress = await db.oneOrNone(
      `SELECT id FROM progress
       WHERE user_id = $1 AND content_type = $2 AND content_id = $3`,
      [userId, contentType, contentId]
    );

    if (existingProgress) {
      // Update existing progress
      await db.none(
        `UPDATE progress
         SET status = $1, score = $2, updated_at = NOW()
         WHERE user_id = $3 AND content_type = $4 AND content_id = $5`,
        [status, score || null, userId, contentType, contentId]
      );
    } else {
      // Create new progress record
      const progressId = uuidv4();
      await db.none(
        `INSERT INTO progress (id, user_id, content_type, content_id, status, score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [progressId, userId, contentType, contentId, status, score || null]
      );
    }
  }
}
