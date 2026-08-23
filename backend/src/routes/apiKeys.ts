/**
 * API Keys Routes - Manage API keys for integrations
 */

import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { APIKeyService } from '../services/apiKeyService';
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
// API KEY MANAGEMENT
// ============================================================================

// GET /api/api-keys - Get all API keys for current admin
router.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const keys = await APIKeyService.getKeys(req.user!.user_id);

    res.json({
      success: true,
      data: keys,
      count: keys.length,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/api-keys - Create new API key
router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, permissions, expires_in, rate_limit } = req.body;

    InputValidator.validateString(name, 'name', 1, 100);

    if (permissions) {
      InputValidator.validateArray(permissions, 'permissions', 1);
      const validPermissions = ['read', 'write', 'delete', 'admin'];
      for (const perm of permissions) {
        if (!validPermissions.includes(perm)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid Permission',
            message: `Invalid permission: ${perm}`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    if (expires_in) {
      InputValidator.validateNumber(expires_in, 'expires_in', 3600, 31536000); // 1 hour to 1 year
    }

    if (rate_limit) {
      InputValidator.validateNumber(rate_limit, 'rate_limit', 1, 100000);
    }

    const apiKey = await APIKeyService.generateKey(
      name,
      req.user!.user_id,
      permissions || ['read'],
      expires_in,
      rate_limit
    );

    res.status(201).json({
      success: true,
      data: apiKey,
      message: 'API key created. Save the key value securely - it won\'t be shown again',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/api-keys/:key_id - Update API key
router.put(
  '/:key_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { key_id } = req.params;
    const { permissions, rate_limit } = req.body;

    InputValidator.validateUUID(key_id, 'key_id');

    // Ключът трябва да е на ТОЗИ админ — иначе всеки админ пипа чуждите.
    if (permissions) {
      InputValidator.validateArray(permissions, 'permissions', 1);
      await APIKeyService.updatePermissions(key_id, req.user!.user_id, permissions);
    }

    if (rate_limit) {
      InputValidator.validateNumber(rate_limit, 'rate_limit', 1, 100000);
      await APIKeyService.setRateLimit(key_id, req.user!.user_id, rate_limit);
    }

    res.json({
      success: true,
      message: 'API key updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/api-keys/:key_id/rotate - Rotate API key
router.post(
  '/:key_id/rotate',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { key_id } = req.params;
    InputValidator.validateUUID(key_id, 'key_id');

    const newKey = await APIKeyService.rotateKey(key_id, req.user!.user_id);

    res.json({
      success: true,
      data: newKey,
      message: 'API key rotated successfully. Old key has been deactivated.',
      timestamp: new Date().toISOString(),
    });
  })
);

// DELETE /api/api-keys/:key_id - Revoke API key
router.delete(
  '/:key_id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { key_id } = req.params;
    InputValidator.validateUUID(key_id, 'key_id');

    await APIKeyService.revokeKey(key_id, req.user!.user_id);

    res.json({
      success: true,
      message: 'API key revoked successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================================================
// API KEY MONITORING
// ============================================================================

// GET /api/api-keys/:key_id/stats - Get API key usage statistics
router.get(
  '/:key_id/stats',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { key_id } = req.params;
    InputValidator.validateUUID(key_id, 'key_id');

    const stats = await APIKeyService.getKeyStats(key_id, req.user!.user_id);

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/api-keys/:key_id/logs - Get API key usage logs
router.get(
  '/:key_id/logs',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { key_id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    InputValidator.validateUUID(key_id, 'key_id');

    const logs = await APIKeyService.getKeyLogs(key_id, req.user!.user_id, limit);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
