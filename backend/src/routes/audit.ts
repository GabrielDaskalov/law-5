/**
 * Audit Logs Routes - View and manage audit logs
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { AuditService } from '../services/auditService';
import { InputValidator } from '../utils/validation';

const router = Router();

// Middleware to check admin role
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Admin access required',
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

// ============================================================================
// AUDIT LOGS
// ============================================================================

// GET /api/audit/logs - Get audit logs with filtering
router.get(
  '/logs',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const adminId = (req.query.admin_id as string) || undefined;
    const resourceType = (req.query.resource_type as string) || undefined;
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await AuditService.getAuditLogs(adminId, resourceType, startDate, endDate, limit, offset);

    res.json({
      success: true,
      data: logs,
      pagination: { limit, offset },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/audit/logs/:log_id - Get specific audit log
router.get(
  '/logs/:log_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { log_id } = req.params;
    InputValidator.validateUUID(log_id, 'log_id');

    const logs = await AuditService.getAuditLogs();
    const log = logs.find(l => l.id === log_id);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Audit log not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: log,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/audit/resource/:resource_type/:resource_id - Get history for specific resource
router.get(
  '/resource/:resource_type/:resource_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { resource_type, resource_id } = req.params;

    InputValidator.validateString(resource_type, 'resource_type', 1, 50);
    InputValidator.validateUUID(resource_id, 'resource_id');

    const history = await AuditService.getResourceHistory(resource_type, resource_id);

    res.json({
      success: true,
      data: {
        resource_type,
        resource_id,
        history: history,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/audit/search - Search audit logs
router.get(
  '/search',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Search query must be at least 2 characters',
        timestamp: new Date().toISOString(),
      });
    }

    const results = await AuditService.searchAuditLogs(query, limit);

    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/audit/stats - Get audit statistics
router.get(
  '/stats',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days as string) || 30;

    InputValidator.validateNumber(days, 'days', 1, 365);

    const stats = await AuditService.getAuditStats(days);

    res.json({
      success: true,
      data: stats,
      query: { days },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/audit/suspicious/:admin_id - Check suspicious activity
router.get(
  '/suspicious/:admin_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { admin_id } = req.params;
    const timeWindow = parseInt(req.query.time_window as string) || 60;

    InputValidator.validateUUID(admin_id, 'admin_id');
    InputValidator.validateNumber(timeWindow, 'time_window', 1, 1440);

    const activity = await AuditService.detectSuspiciousActivity(admin_id, timeWindow);

    res.json({
      success: true,
      data: activity,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
