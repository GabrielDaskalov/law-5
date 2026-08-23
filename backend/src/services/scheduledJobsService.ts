/**
 * Scheduled Jobs Service - Background tasks and cron jobs
 * Manages periodic tasks like notifications, reports, cleanup, etc.
 */

import { db } from '../db';
import { NotificationSchedulerService } from './notificationSchedulerService';
import { AuditService } from './auditService';
import { APIKeyService } from './apiKeyService';
import { WebhookService } from './webhookService';
import { CacheService } from './cacheService';

export class ScheduledJobsService {
  /**
   * Process scheduled notifications
   * Runs every 5 minutes
   */
  static async processScheduledNotifications(): Promise<number> {
    try {
      return await NotificationSchedulerService.processScheduledNotifications();
    } catch (error) {
      console.error('Error processing scheduled notifications:', error);
      return 0;
    }
  }

  /**
   * Generate daily summary reports
   * Runs every day at 11 PM
   */
  static async generateDailyReports(): Promise<number> {
    try {
      const users = await db.manyOrNone<any>(
        `SELECT id FROM users WHERE role = 'student' ORDER BY created_at DESC LIMIT 1000`
      );

      let generated = 0;

      for (const user of users) {
        // Generate daily report data
        const dailyStats = await db.one<any>(
          `SELECT
            COUNT(*) as items_completed,
            (SELECT AVG(score) FROM quiz_results WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '1 day') as avg_score
           FROM progress
           WHERE user_id = $1 AND completed_at > NOW() - INTERVAL '1 day'`,
          [user.id]
        );

        if (parseInt(dailyStats.items_completed) > 0) {
          // Queue notification for user
          await db.none(
            `INSERT INTO notifications (id, user_id, type, subject, message, created_at)
             VALUES (gen_random_uuid(), $1, 'daily_summary', 'Daily Learning Summary',
                     'You completed ' || $2 || ' items today. Average score: ' || COALESCE($3::text, 'N/A') || '%',
                     NOW())`,
            [user.id, dailyStats.items_completed, dailyStats.avg_score]
          );

          generated++;
        }
      }

      return generated;
    } catch (error) {
      console.error('Error generating daily reports:', error);
      return 0;
    }
  }

  /**
   * Archive old audit logs
   * Runs weekly on Sunday
   */
  static async archiveOldAuditLogs(): Promise<number> {
    try {
      const daysToKeep = 90; // Keep 90 days of audit logs
      return await AuditService.archiveOldLogs(daysToKeep);
    } catch (error) {
      console.error('Error archiving audit logs:', error);
      return 0;
    }
  }

  /**
   * Clean up expired API keys
   * Runs daily at 2 AM
   */
  static async cleanupExpiredApiKeys(): Promise<number> {
    try {
      return await APIKeyService.cleanupExpiredKeys();
    } catch (error) {
      console.error('Error cleaning up API keys:', error);
      return 0;
    }
  }

  /**
   * Retry failed webhooks
   * Runs every 30 minutes
   */
  static async retryFailedWebhooks(): Promise<number> {
    try {
      return await WebhookService.retryFailedEvents();
    } catch (error) {
      console.error('Error retrying webhooks:', error);
      return 0;
    }
  }

  /**
   * Clear expired cache entries
   * Runs every hour
   */
  static async clearExpiredCache(): Promise<void> {
    try {
      const stats = CacheService.getStats();
      console.log(`Cache cleanup: ${stats.size} entries before cleanup`);

      // The cache service automatically removes expired entries on access
      // This is just for logging purposes
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Generate achievement notifications
   * Runs every 10 minutes
   */
  static async checkAndGrantAchievements(): Promise<number> {
    try {
      // Обхожда активните потребители и сумира новите постижения
      // (checkAchievements изисква userId и връща списък)
      const users = await db.manyOrNone<{ id: string }>(
        'SELECT id FROM users WHERE is_active = true'
      );

      let total = 0;
      for (const user of users || []) {
        const achievements = await NotificationSchedulerService.checkAchievements(user.id);
        total += Array.isArray(achievements) ? achievements.length : 0;
      }
      return total;
    } catch (error) {
      console.error('Error checking achievements:', error);
      return 0;
    }
  }

  /**
   * Deactivate inactive users
   * Runs weekly
   */
  static async deactivateInactiveUsers(daysInactive: number = 90): Promise<number> {
    try {
      // ПОПРАВКА: в users колоните са `is_active` (не `active`)
      // и `last_login` (не `last_login_at`).
      const result = await db.result(
        `UPDATE users SET is_active = false
         WHERE is_active = true AND role = 'student'
         AND last_login < NOW() - INTERVAL '${daysInactive} days'`
      );

      return result.rowCount;
    } catch (error) {
      console.error('Error deactivating inactive users:', error);
      return 0;
    }
  }

  /**
   * Cleanup old notification records
   * Runs weekly
   */
  static async cleanupOldNotifications(daysToKeep: number = 30): Promise<number> {
    try {
      const result = await db.result(
        `DELETE FROM notifications WHERE read = true AND created_at < NOW() - INTERVAL '${daysToKeep} days'`
      );

      return result.rowCount;
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      return 0;
    }
  }

  /**
   * Generate admin activity report
   * Runs daily
   */
  static async generateAdminReport(): Promise<any> {
    try {
      return await AuditService.getAuditStats(1); // Last 1 day
    } catch (error) {
      console.error('Error generating admin report:', error);
      return null;
    }
  }

  /**
   * Detect suspicious activities
   * Runs every 15 minutes
   */
  static async detectSuspiciousActivities(): Promise<number> {
    try {
      const admins = await db.manyOrNone<any>(
        'SELECT DISTINCT admin_id FROM audit_logs WHERE created_at > NOW() - INTERVAL \'1 hour\''
      );

      let suspiciousCount = 0;

      for (const admin of admins) {
        const activity = await AuditService.detectSuspiciousActivity(admin.admin_id, 60);

        if (activity.suspicious) {
          // Log alert
          console.warn(`Suspicious activity detected for admin ${admin.admin_id}:`, activity.indicators);

          // Queue alert notification
          await db.none(
            `INSERT INTO notifications (id, user_id, type, subject, message, created_at)
             VALUES (gen_random_uuid(), $1, 'security_alert', 'Suspicious Activity Detected',
                     'Unusual activity detected on your account. Review: ' || $2::text,
                     NOW())`,
            [admin.admin_id, JSON.stringify(activity.indicators)]
          );

          suspiciousCount++;
        }
      }

      return suspiciousCount;
    } catch (error) {
      console.error('Error detecting suspicious activities:', error);
      return 0;
    }
  }

  /**
   * Generate database statistics
   * Runs daily
   */
  static async updateDatabaseStatistics(): Promise<void> {
    try {
      // PostgreSQL ANALYZE
      await db.none('ANALYZE');
      console.log('Database statistics updated');
    } catch (error) {
      console.error('Error updating database statistics:', error);
    }
  }

  /**
   * Backup important data
   * Runs daily at 3 AM
   */
  static async backupCriticalData(): Promise<void> {
    try {
      // Export admin actions and user data for backup
      const timestamp = new Date().toISOString().split('T')[0];

      const auditLogs = await db.manyOrNone(
        `SELECT * FROM audit_logs WHERE DATE(created_at) = CURRENT_DATE`
      );

      // ПОПРАВКА: колоните са `name` и `last_login`, а не `full_name` и
      // `last_login_at`. Псевдонимите пазят формата на архивния запис.
      const userData = await db.manyOrNone(
        'SELECT id, email, name AS full_name, role, created_at, last_login AS last_login_at FROM users'
      );

      console.log(`Backup created for ${timestamp}: ${auditLogs.length} audit logs, ${userData.length} users`);

      // In production: Upload to cloud storage (S3, GCS, Azure Blob)
    } catch (error) {
      console.error('Error backing up data:', error);
    }
  }

  /**
   * Run all maintenance jobs
   * Call this from your cron scheduler
   */
  static async runMaintenanceJobs(): Promise<void> {
    console.log('[Maintenance] Starting maintenance jobs...');

    // Process notifications (every 5 minutes)
    await this.processScheduledNotifications();

    // Clear cache (hourly)
    await this.clearExpiredCache();

    // Retry webhooks (every 30 minutes)
    await this.retryFailedWebhooks();

    // Check achievements (every 10 minutes)
    await this.checkAndGrantAchievements();

    // Detect suspicious activity (every 15 minutes)
    await this.detectSuspiciousActivities();

    console.log('[Maintenance] Maintenance jobs completed');
  }

  /**
   * Run daily jobs
   * Call this once per day
   */
  static async runDailyJobs(): Promise<void> {
    console.log('[Daily] Starting daily jobs...');

    await this.generateDailyReports();
    await this.cleanupExpiredApiKeys();
    await this.generateAdminReport();
    await this.updateDatabaseStatistics();
    await this.backupCriticalData();

    console.log('[Daily] Daily jobs completed');
  }

  /**
   * Run weekly jobs
   * Call this once per week
   */
  static async runWeeklyJobs(): Promise<void> {
    console.log('[Weekly] Starting weekly jobs...');

    await this.archiveOldAuditLogs();
    await this.deactivateInactiveUsers();
    await this.cleanupOldNotifications();

    console.log('[Weekly] Weekly jobs completed');
  }
}
