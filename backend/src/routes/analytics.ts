/**
 * Analytics Routes - User and platform analytics endpoints
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { AnalyticsService } from '../services/analyticsService';
import { InputValidator } from '../utils/validation';

const router = Router();

// Admin authorization middleware
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
// USER ANALYTICS
// ============================================================================

// GET /api/analytics/user/me - Current user's analytics
router.get(
  '/user/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const analytics = await AnalyticsService.getUserAnalytics(userId);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/analytics/user/:user_id - Specific user's analytics (admin)
router.get(
  '/user/:user_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { user_id } = req.params;

    InputValidator.validateUUID(user_id, 'user_id');

    const analytics = await AnalyticsService.getUserAnalytics(user_id);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/analytics/user/trends/:user_id - Performance trends over time
router.get(
  '/user/:user_id/trends',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user?.role === 'admin' ? req.params.user_id : req.user!.user_id;
    const days = parseInt(req.query.days as string) || 30;

    InputValidator.validateNumber(days, 'days', 1, 365);

    const trends = await AnalyticsService.getPerformanceTrends(userId, days);

    res.json({
      success: true,
      data: trends,
      query: { days },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/analytics/recommendations - Learning path recommendations
router.get(
  '/recommendations',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const recommendations = await AnalyticsService.getLearningRecommendations(userId);

    res.json({
      success: true,
      data: recommendations,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// PLATFORM ANALYTICS (Admin Only)
// ============================================================================

// GET /api/analytics/platform - Platform-wide statistics
router.get(
  '/platform',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const analytics = await AnalyticsService.getPlatformAnalytics();

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// SUBJECT ANALYTICS (Admin Only)
// ============================================================================

// GET /api/analytics/subject/:subject_id - Subject-specific analytics
router.get(
  '/subject/:subject_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject_id } = req.params;

    InputValidator.validateUUID(subject_id, 'subject_id');

    const analytics = await AnalyticsService.getSubjectAnalytics(subject_id);

    res.json({
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// DASHBOARD SUMMARY
// ============================================================================

// GET /api/analytics/dashboard - Complete analytics dashboard
router.get(
  '/dashboard',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    // Get user analytics
    const userAnalytics = await AnalyticsService.getUserAnalytics(userId);

    // Get recommendations
    const recommendations = await AnalyticsService.getLearningRecommendations(userId);

    // Get trends (last 7 days)
    const trends = await AnalyticsService.getPerformanceTrends(userId, 7);

    // Get platform stats if admin
    let platformStats = null;
    if (req.user?.role === 'admin') {
      platformStats = await AnalyticsService.getPlatformAnalytics();
    }

    res.json({
      success: true,
      data: {
        user_analytics: userAnalytics,
        recommendations,
        recent_trends: trends,
        platform_stats: platformStats,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
