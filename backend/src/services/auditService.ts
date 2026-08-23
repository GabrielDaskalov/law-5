/**
 * Audit Service - Track all admin actions for compliance and security
 * Maintains detailed audit logs of user modifications and admin operations
 */

import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: Record<string, any>;
  ip_address: string;
  user_agent: string;
  status: 'success' | 'failure';
  error_message?: string;
  created_at: Date;
}

export class AuditService {
  /**
   * Log an admin action
   */
  static async logAction(
    adminId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    changes: Record<string, any>,
    ipAddress: string,
    userAgent: string,
    status: 'success' | 'failure' = 'success',
    errorMessage?: string
  ): Promise<string> {
    const id = uuidv4();

    try {
      await db.none(
        `INSERT INTO audit_logs (id, admin_id, action, resource_type, resource_id, changes, ip_address, user_agent, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          adminId,
          action,
          resourceType,
          resourceId,
          JSON.stringify(changes),
          ipAddress,
          userAgent,
          status,
          errorMessage || null,
        ]
      );

      return id;
    } catch (error: any) {
      // Одит, който мълчи, е по-лош от липсващ: изглежда, че следа има, а при
      // инцидент се оказва, че няма — и никой не е разбрал кога е спряла.
      // Затова провалът се вижда шумно и с всичко нужно, за да се възстанови
      // записът на ръка: кой, какво, върху какво и защо се е счупило.
      console.error(
        '[ОДИТ] ЗАПИСЪТ СЕ ПРОВАЛИ — действието НЕ е проследено:',
        JSON.stringify({
          admin_id: adminId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          ip_address: ipAddress,
          status,
          at: new Date().toISOString(),
          error: error?.message || String(error),
        })
      );
      console.error(error?.stack || error);
      // Не хвърляме: одитът не бива да чупи самата операция.
      return '';
    }
  }

  /**
   * Get audit logs with filtering
   */
  static async getAuditLogs(
    adminId?: string,
    resourceType?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100,
    offset: number = 0
  ): Promise<AuditLog[]> {
    let query =
      'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (adminId) {
      query += ` AND admin_id = $${paramCount}`;
      params.push(adminId);
      paramCount++;
    }

    if (resourceType) {
      query += ` AND resource_type = $${paramCount}`;
      params.push(resourceType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const logs = await db.manyOrNone<AuditLog>(query, params);

    return logs.map((log: any) => ({
      ...log,
      changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes,
    }));
  }

  /**
   * Get audit statistics
   */
  static async getAuditStats(days: number = 30): Promise<any> {
    const stats = await db.one<any>(
      `SELECT
        COUNT(*) as total_actions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failed,
        COUNT(DISTINCT admin_id) as active_admins,
        COUNT(DISTINCT resource_type) as resource_types_modified
       FROM audit_logs
       WHERE created_at > NOW() - INTERVAL '${days} days'`
    );

    const actionsByType = await db.manyOrNone<any>(
      `SELECT action, COUNT(*) as count
       FROM audit_logs
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY action
       ORDER BY count DESC`
    );

    const adminsActivity = await db.manyOrNone<any>(
      `SELECT
        admin_id,
        (SELECT email FROM users WHERE id = audit_logs.admin_id) as admin_email,
        COUNT(*) as action_count,
        MAX(created_at) as last_action
       FROM audit_logs
       WHERE created_at > NOW() - INTERVAL '${days} days'
       GROUP BY admin_id
       ORDER BY action_count DESC`
    );

    return {
      summary: {
        total_actions: parseInt(stats.total_actions),
        successful_actions: parseInt(stats.successful),
        failed_actions: parseInt(stats.failed),
        active_admins: parseInt(stats.active_admins),
        resource_types_modified: parseInt(stats.resource_types_modified),
      },
      actions_by_type: actionsByType,
      admins_activity: adminsActivity,
    };
  }

  /**
   * Search audit logs
   */
  static async searchAuditLogs(query: string, limit: number = 50): Promise<AuditLog[]> {
    const results = await db.manyOrNone<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE action ILIKE $1 OR resource_type ILIKE $1 OR resource_id ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${query}%`, limit]
    );

    return results.map((log: any) => ({
      ...log,
      changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes,
    }));
  }

  /**
   * Get logs for specific resource
   */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string
  ): Promise<AuditLog[]> {
    const logs = await db.manyOrNone<AuditLog>(
      `SELECT * FROM audit_logs
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY created_at DESC`,
      [resourceType, resourceId]
    );

    return logs.map((log: any) => ({
      ...log,
      changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes,
    }));
  }

  /**
   * Archive old audit logs
   */
  static async archiveOldLogs(daysToKeep: number = 90): Promise<number> {
    const result = await db.result(
      `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
    );

    return result.rowCount;
  }

  /**
   * Detect suspicious activity
   */
  static async detectSuspiciousActivity(
    adminId: string,
    timeWindowMinutes: number = 60
  ): Promise<any> {
    const recentActions = await db.manyOrNone<any>(
      `SELECT action, COUNT(*) as count
       FROM audit_logs
       WHERE admin_id = $1 AND created_at > NOW() - INTERVAL '${timeWindowMinutes} minutes'
       GROUP BY action
       ORDER BY count DESC`,
      [adminId]
    );

    const failedAttempts = await db.one<any>(
      `SELECT COUNT(*) as count FROM audit_logs
       WHERE admin_id = $1 AND status = 'failure'
       AND created_at > NOW() - INTERVAL '${timeWindowMinutes} minutes'`,
      [adminId]
    );

    const suspiciousIndicators = [];

    // Multiple failed attempts
    if (parseInt(failedAttempts.count) > 5) {
      suspiciousIndicators.push(`${failedAttempts.count} failed attempts in ${timeWindowMinutes} minutes`);
    }

    // Bulk delete operations
    const bulkDeletes = recentActions.find((a: any) => a.action.includes('DELETE_BATCH'));
    if (bulkDeletes && parseInt(bulkDeletes.count) > 3) {
      suspiciousIndicators.push(`Multiple bulk delete operations (${bulkDeletes.count})`);
    }

    return {
      admin_id: adminId,
      suspicious: suspiciousIndicators.length > 0,
      indicators: suspiciousIndicators,
      recent_actions: recentActions,
    };
  }
}
