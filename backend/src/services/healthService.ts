/**
 * Health Service - System health monitoring and diagnostics
 * Provides detailed health status, performance metrics, and system information
 */

import { db } from '../db';
import { CacheService } from './cacheService';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  checks: {
    database: HealthCheck;
    cache: HealthCheck;
    api_response_time: HealthCheck;
  };
  metrics: {
    total_users: number;
    total_content_items: number;
    total_quizzes_taken: number;
    cache_size: number;
    cache_entries: number;
  };
  environment: {
    node_env: string;
    node_version: string;
  };
}

export interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
  message: string;
  response_time_ms: number;
}

export class HealthService {
  private static startTime = Date.now();

  /**
   * Get comprehensive health status
   */
  static async getHealthStatus(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Check database connection
    const dbCheck = await this.checkDatabase();

    // Check cache status
    const cacheCheck = this.checkCache();

    // Check API response time
    const apiCheck = await this.checkAPIResponseTime();

    // Get metrics
    const metrics = await this.getSystemMetrics();

    // Determine overall status
    const hasError = [dbCheck, cacheCheck, apiCheck].some(check => check.status === 'error');
    const hasWarning = [dbCheck, cacheCheck, apiCheck].some(check => check.status === 'warning');
    const status = hasError ? 'unhealthy' : hasWarning ? 'degraded' : 'healthy';

    return {
      status,
      timestamp,
      uptime_seconds: uptime,
      checks: {
        database: dbCheck,
        cache: cacheCheck,
        api_response_time: apiCheck,
      },
      metrics,
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        node_version: process.version,
      },
    };
  }

  /**
   * Check database connectivity and performance
   */
  private static async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      await db.one('SELECT 1 as ping');
      const responseTime = Date.now() - startTime;

      let status: 'ok' | 'warning' | 'error' = 'ok';
      let message = 'Database connection OK';

      if (responseTime > 1000) {
        status = 'warning';
        message = `Database slow: ${responseTime}ms response time`;
      }

      return {
        status,
        message,
        response_time_ms: responseTime,
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: `Database connection failed: ${error.message}`,
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Check cache status
   */
  private static checkCache(): HealthCheck {
    try {
      const stats = CacheService.getStats();

      let status: 'ok' | 'warning' | 'error' = 'ok';
      let message = `Cache OK: ${stats.size} entries`;

      // Warn if cache is getting large (potential memory issue)
      if (stats.size > 10000) {
        status = 'warning';
        message = `Cache large: ${stats.size} entries (memory usage may be high)`;
      }

      return {
        status,
        message,
        response_time_ms: 0,
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: `Cache error: ${error.message}`,
        response_time_ms: 0,
      };
    }
  }

  /**
   * Check API response time
   */
  private static async checkAPIResponseTime(): Promise<HealthCheck> {
    const startTime = Date.now();

    try {
      // Simulate an API call by querying basic data
      await db.one('SELECT COUNT(*) as count FROM users');
      const responseTime = Date.now() - startTime;

      let status: 'ok' | 'warning' | 'error' = 'ok';
      let message = 'API response time OK';

      if (responseTime > 500) {
        status = 'warning';
        message = `API slow: ${responseTime}ms response time`;
      }

      return {
        status,
        message,
        response_time_ms: responseTime,
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: `API check failed: ${error.message}`,
        response_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Get system metrics
   */
  private static async getSystemMetrics(): Promise<{
    total_users: number;
    total_content_items: number;
    total_quizzes_taken: number;
    cache_size: number;
    cache_entries: number;
  }> {
    try {
      const users = await db.one<any>('SELECT COUNT(*) as count FROM users');

      const content = await db.one<any>(
        `SELECT
          (SELECT COUNT(*) FROM flashcards) +
          (SELECT COUNT(*) FROM quizzes) +
          (SELECT COUNT(*) FROM lectures) +
          (SELECT COUNT(*) FROM cases) as count`
      );

      const quizzes = await db.one<any>('SELECT COUNT(*) as count FROM quiz_results');

      const cacheStats = CacheService.getStats();

      return {
        total_users: parseInt(users.count) || 0,
        total_content_items: parseInt(content.count) || 0,
        total_quizzes_taken: parseInt(quizzes.count) || 0,
        cache_size: cacheStats.size,
        cache_entries: cacheStats.keys.length,
      };
    } catch (error) {
      return {
        total_users: 0,
        total_content_items: 0,
        total_quizzes_taken: 0,
        cache_size: 0,
        cache_entries: 0,
      };
    }
  }

  /**
   * Get detailed performance metrics
   */
  static async getDetailedMetrics(): Promise<any> {
    try {
      const userStats = await db.one<any>(
        `SELECT
          COUNT(*) as total,
          -- ПОПРАВКА: в users няма last_login_at — колоната се казва last_login.
          (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '1 day') as active_today,
          (SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '7 days') as active_week,
          (SELECT AVG(EXTRACT(EPOCH FROM (created_at - NOW()))) as avg_age FROM users) as avg_account_age_seconds
         FROM users`
      );

      // ПОПРАВКА: flashcards.difficulty е текст ('easy'/'medium'/'hard'), а не
      // число — AVG върху него гърмеше с „function avg(character varying)
      // does not exist“. Превеждаме степента в скала 1-3 и чак тогава осредняваме.
      const contentStats = await db.manyOrNone<any>(
        `SELECT
          'flashcards' as type,
          COUNT(*) as count,
          ROUND(AVG(CASE difficulty
                       WHEN 'easy' THEN 1
                       WHEN 'medium' THEN 2
                       WHEN 'hard' THEN 3
                     END)::numeric, 2) as avg_difficulty
         FROM flashcards
         UNION ALL
         SELECT 'quizzes', COUNT(*), NULL FROM quizzes
         UNION ALL
         SELECT 'lectures', COUNT(*), NULL FROM lectures
         UNION ALL
         SELECT 'cases', COUNT(*), NULL FROM cases`
      );

      const progressStats = await db.one<any>(
        `SELECT
          COUNT(*) as total_progress_items,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as completion_rate
         FROM progress`
      );

      const quizStats = await db.one<any>(
        `SELECT
          COUNT(*) as total_attempts,
          AVG(score) as average_score,
          MAX(score) as highest_score,
          MIN(score) as lowest_score,
          STDDEV(score) as score_stddev
         FROM quiz_results`
      );

      return {
        users: {
          total: parseInt(userStats.total),
          active_today: parseInt(userStats.active_today),
          active_week: parseInt(userStats.active_week),
        },
        content: contentStats,
        progress: {
          total_items: parseInt(progressStats.total_progress_items),
          completed: parseInt(progressStats.completed),
          completion_rate: parseFloat(progressStats.completion_rate) || 0,
        },
        quiz_performance: {
          total_attempts: parseInt(quizStats.total_attempts),
          average_score: parseFloat(quizStats.average_score) || 0,
          highest_score: parseFloat(quizStats.highest_score) || 0,
          lowest_score: parseFloat(quizStats.lowest_score) || 0,
          score_standard_deviation: parseFloat(quizStats.score_stddev) || 0,
        },
        cache: CacheService.getStats(),
      };
    } catch (error: any) {
      throw new Error(`Failed to get detailed metrics: ${error.message}`);
    }
  }

  /**
   * Check if system is ready for operation
   */
  static async isReady(): Promise<boolean> {
    try {
      const health = await this.getHealthStatus();
      return health.status !== 'unhealthy';
    } catch (error) {
      return false;
    }
  }

  /**
   * Get system readiness report
   */
  static async getReadinessReport(): Promise<{
    ready: boolean;
    reason?: string;
    details: any;
  }> {
    try {
      const health = await this.getHealthStatus();
      const isReady = health.status !== 'unhealthy';

      let reason: string | undefined;

      if (!isReady) {
        const failedChecks = Object.entries(health.checks)
          .filter(([_, check]) => check.status === 'error')
          .map(([name, check]) => `${name}: ${check.message}`);

        reason = failedChecks.join('; ');
      }

      return {
        ready: isReady,
        reason,
        details: health,
      };
    } catch (error: any) {
      return {
        ready: false,
        reason: `Readiness check failed: ${error.message}`,
        details: null,
      };
    }
  }
}
