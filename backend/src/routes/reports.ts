/**
 * Reports Routes - Advanced reporting and insights
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { ReportService } from '../services/reportService';
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
// USER REPORTS
// ============================================================================

// GET /api/reports/user/me - Current user's detailed report
router.get(
  '/user/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const report = await ReportService.generateUserReport(userId);

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/reports/user/:user_id - Specific user's detailed report (admin)
router.get(
  '/user/:user_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.user_id;

    InputValidator.validateUUID(userId, 'user_id');

    const report = await ReportService.generateUserReport(userId);

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// SUBJECT REPORTS
// ============================================================================

// GET /api/reports/subject/:subject_id - Subject performance report (admin)
router.get(
  '/subject/:subject_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const subjectId = req.params.subject_id;

    InputValidator.validateUUID(subjectId, 'subject_id');

    const report = await ReportService.generateSubjectReport(subjectId);

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// COHORT REPORTS
// ============================================================================

// GET /api/reports/cohort - Overall cohort/platform report (admin)
router.get(
  '/cohort',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const cohortName = (req.query.name as string) || undefined;

    const report = await ReportService.generateCohortReport(cohortName);

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
