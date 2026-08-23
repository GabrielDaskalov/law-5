/**
 * Webhooks Routes - Manage webhook subscriptions
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { WebhookService } from '../services/webhookService';
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
// WEBHOOK MANAGEMENT
// ============================================================================

// GET /api/webhooks - Get all webhooks for current admin
router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const webhooks = await WebhookService.getWebhooks(req.user!.user_id);

    res.json({
      success: true,
      data: webhooks,
      count: webhooks.length,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/webhooks - Create new webhook
router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, url, events } = req.body;

    InputValidator.validateString(name, 'name', 1, 100);
    InputValidator.validateURL(url, 'url');
    InputValidator.validateArray(events, 'events', 1);

    const validEvents = [
      'user.created',
      'user.updated',
      'user.deleted',
      'progress.completed',
      'quiz.submitted',
      'study_plan.generated',
      'notification.sent',
      'achievement.unlocked',
    ];

    for (const event of events) {
      if (!validEvents.includes(event)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Event',
          message: `Invalid event: ${event}`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const webhook = await WebhookService.createWebhook(req.user!.user_id, name, url, events);

    res.status(201).json({
      success: true,
      data: webhook,
      message: 'Webhook created successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/webhooks/:webhook_id - Get webhook details
router.get(
  '/:webhook_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { webhook_id } = req.params;
    InputValidator.validateUUID(webhook_id, 'webhook_id');

    const webhooks = await WebhookService.getWebhooks(req.user!.user_id);
    const webhook = webhooks.find(w => w.id === webhook_id);

    if (!webhook) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Webhook not found',
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: webhook,
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/webhooks/:webhook_id - Update webhook
router.put(
  '/:webhook_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { webhook_id } = req.params;
    const { name, url, events, active } = req.body;

    InputValidator.validateUUID(webhook_id, 'webhook_id');

    if (name) InputValidator.validateString(name, 'name', 1, 100);
    if (url) InputValidator.validateURL(url, 'url');
    if (events) InputValidator.validateArray(events, 'events', 1);

    // Webhook-ът трябва да е на ТОЗИ админ: чужд URL, пренасочен към сървър
    // на нападателя, отклонява всички бъдещи събития.
    await WebhookService.updateWebhook(
      webhook_id,
      req.user!.user_id,
      name,
      url,
      events,
      active
    );

    res.json({
      success: true,
      message: 'Webhook updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/webhooks/:webhook_id - Delete webhook
router.delete(
  '/:webhook_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { webhook_id } = req.params;
    InputValidator.validateUUID(webhook_id, 'webhook_id');

    await WebhookService.deleteWebhook(webhook_id, req.user!.user_id);

    res.json({
      success: true,
      message: 'Webhook deleted successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// WEBHOOK TESTING & MONITORING
// ============================================================================

// POST /api/webhooks/:webhook_id/test - Test webhook
router.post(
  '/:webhook_id/test',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { webhook_id } = req.params;
    InputValidator.validateUUID(webhook_id, 'webhook_id');

    const success = await WebhookService.testWebhook(webhook_id, req.user!.user_id);

    res.json({
      success: true,
      data: {
        webhook_id,
        test_result: success ? 'success' : 'failed',
      },
      message: success ? 'Webhook test successful' : 'Webhook test failed',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/webhooks/:webhook_id/history - Get webhook delivery history
router.get(
  '/:webhook_id/history',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { webhook_id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    InputValidator.validateUUID(webhook_id, 'webhook_id');

    const history = await WebhookService.getWebhookHistory(webhook_id, req.user!.user_id, limit);

    res.json({
      success: true,
      data: history,
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/webhooks/:webhook_id/stats - Get webhook statistics
router.get(
  '/:webhook_id/stats',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { webhook_id } = req.params;
    InputValidator.validateUUID(webhook_id, 'webhook_id');

    const stats = await WebhookService.getWebhookStats(webhook_id, req.user!.user_id);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
