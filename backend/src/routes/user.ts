import { Router } from 'express';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';

const router = Router();

// GET /api/user/profile
router.get(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;

    const user = await db.oneOrNone(
      `SELECT id, email, name, role, subscription_status, avatar_url, bio, theme, language, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/user/profile
router.put(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { name, avatar_url, bio } = req.body;

    // TODO: Add validation

    await db.none(
      `UPDATE users
       SET name = COALESCE($1, name),
           avatar_url = COALESCE($2, avatar_url),
           bio = COALESCE($3, bio),
           updated_at = NOW()
       WHERE id = $4`,
      [name, avatar_url, bio, userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

// PUT /api/user/preferences
router.put(
  '/preferences',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.user_id;
    const { theme, language } = req.body;

    // TODO: Add validation

    await db.none(
      `UPDATE users
       SET theme = COALESCE($1, theme),
           language = COALESCE($2, language),
           updated_at = NOW()
       WHERE id = $3`,
      [theme, language, userId]
    );

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

export default router;
