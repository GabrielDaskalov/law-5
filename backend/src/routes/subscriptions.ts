/**
 * Subscriptions Routes - Manage recurring billing and subscriptions
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { StripeService } from '../services/stripeService';
import { InputValidator } from '../utils/validation';
import { db } from '../db';

const router = Router();

// ============================================================================
// SUBSCRIPTION CREATION
// ============================================================================

/**
 * POST /api/subscriptions
 * Create a new subscription for current user
 * Body: { price_id: string, trial_days?: number, metadata?: Record<string, any> }
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { price_id, trial_days, metadata } = req.body;

    InputValidator.validateString(price_id, 'price_id', 1, 100);

    if (trial_days) {
      InputValidator.validateNumber(trial_days, 'trial_days', 0, 365);
    }

    if (metadata && typeof metadata !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Metadata',
        message: 'Metadata must be an object',
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Check if user already has active subscription
      const existingSubscription = await db.oneOrNone<any>(
        `SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ('active', 'trialing')`,
        [req.user!.user_id]
      );

      if (existingSubscription) {
        return res.status(400).json({
          success: false,
          error: 'Active Subscription Exists',
          message: 'User already has an active subscription. Cancel existing subscription first.',
          timestamp: new Date().toISOString(),
        });
      }

      const subscription = await StripeService.createSubscription(
        req.user!.user_id,
        price_id,
        trial_days
      );

      res.status(201).json({
        success: true,
        data: subscription,
        message: 'Subscription created successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: 'Subscription Creation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// GET CURRENT SUBSCRIPTION
// ============================================================================

/**
 * GET /api/subscriptions/current
 * Get current subscription for authenticated user
 */
router.get(
  '/current',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const subscription = await StripeService.getUserSubscription(req.user!.user_id);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'No Active Subscription',
          message: 'User does not have an active subscription',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        data: subscription,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to Retrieve Subscription',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// UPDATE SUBSCRIPTION
// ============================================================================

/**
 * PUT /api/subscriptions/current
 * Update current subscription (change plan)
 * Body: { new_price_id: string }
 */
router.put(
  '/current',
  authenticate,
  asyncHandler(async (req, res) => {
    const { new_price_id } = req.body;

    InputValidator.validateString(new_price_id, 'new_price_id', 1, 100);

    try {
      const subscription = await StripeService.updateSubscription(
        req.user!.user_id,
        new_price_id
      );

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'No Active Subscription',
          message: 'User does not have an active subscription to update',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: 'Subscription Update Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// CANCEL SUBSCRIPTION
// ============================================================================

/**
 * DELETE /api/subscriptions/current
 * Cancel current subscription
 * Query: immediately? (default false - cancel at period end)
 */
router.delete(
  '/current',
  authenticate,
  asyncHandler(async (req, res) => {
    const immediately = req.query.immediately === 'true';

    try {
      await StripeService.cancelSubscription(req.user!.user_id, immediately);

      res.json({
        success: true,
        message: immediately
          ? 'Subscription canceled immediately'
          : 'Subscription will be canceled at the end of billing period',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: 'Subscription Cancellation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// SUBSCRIPTION HISTORY
// ============================================================================

/**
 * GET /api/subscriptions/history
 * Get all subscriptions history for user (including canceled)
 */
router.get(
  '/history',
  authenticate,
  asyncHandler(async (req, res) => {
    try {
      const subscriptions = await db.manyOrNone<any>(
        `SELECT * FROM subscriptions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [req.user!.user_id]
      );

      res.json({
        success: true,
        data: subscriptions,
        count: subscriptions?.length || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to Retrieve Subscription History',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// AVAILABLE PRODUCTS
// ============================================================================

/**
 * GET /api/subscriptions/products
 * Get available subscription products and prices
 */
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    try {
      const products = await StripeService.listProducts();

      res.json({
        success: true,
        data: products,
        count: products.length,
        message: 'Available products and prices',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to Retrieve Products',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// ADMIN: GET USER SUBSCRIPTION
// ============================================================================

/**
 * GET /api/subscriptions/user/:user_id
 * Get subscription for specific user (admin only)
 */
router.get(
  '/user/:user_id',
  authenticate,
  asyncHandler(async (req, res) => {
    // Check admin role
    if (req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin access required',
        timestamp: new Date().toISOString(),
      });
    }

    const { user_id } = req.params;
    InputValidator.validateUUID(user_id, 'user_id');

    try {
      // Retrieve subscription for the requested user
      const subscription = await StripeService.getUserSubscription(user_id);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'No Active Subscription',
          message: 'User does not have an active subscription',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        data: subscription,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to Retrieve Subscription',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// ADMIN: MANAGE USER SUBSCRIPTION
// ============================================================================

/**
 * POST /api/subscriptions/user/:user_id/cancel
 * Cancel user subscription (admin only)
 */
router.post(
  '/user/:user_id/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    // Check admin role
    if (req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin access required',
        timestamp: new Date().toISOString(),
      });
    }

    const { user_id } = req.params;
    const { immediately } = req.body;

    InputValidator.validateUUID(user_id, 'user_id');

    try {
      await StripeService.cancelSubscription(user_id, immediately === true);

      res.json({
        success: true,
        message: 'Subscription canceled successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: 'Subscription Cancellation Failed',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// ============================================================================
// SUBSCRIPTION METRICS (Admin)
// ============================================================================

/**
 * GET /api/subscriptions/metrics
 * Get subscription metrics across platform (admin only)
 */
router.get(
  '/metrics',
  authenticate,
  asyncHandler(async (req, res) => {
    // Check admin role
    if (req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin access required',
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const metrics = await StripeService.getSubscriptionMetrics();

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to Retrieve Metrics',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

export default router;
