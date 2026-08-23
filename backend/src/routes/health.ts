/**
 * Health Routes - System health monitoring and diagnostics
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/auth';
import { HealthService } from '../services/healthService';

const router = Router();

// ============================================================================
// HEALTH CHECKS
// ============================================================================

// GET /health - Simple health check (no auth required)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isReady = await HealthService.isReady();

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /health/readiness - Kubernetes-style readiness probe
router.get(
  '/readiness',
  asyncHandler(async (req, res) => {
    const readiness = await HealthService.getReadinessReport();

    res.status(readiness.ready ? 200 : 503).json({
      ready: readiness.ready,
      reason: readiness.reason,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /health/liveness - Kubernetes-style liveness probe
router.get(
  '/liveness',
  asyncHandler(async (req, res) => {
    res.json({
      alive: true,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// DETAILED HEALTH STATUS
// ============================================================================

// GET /health/status - Comprehensive health status (no auth required)
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const health = await HealthService.getHealthStatus();

    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /health/metrics - Detailed system metrics (no auth required)
router.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    const metrics = await HealthService.getDetailedMetrics();

    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
