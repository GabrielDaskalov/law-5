/**
 * Checkout — точно API-то, което сайтът Law+ очаква.
 *
 * В HTML-а на сайта (API слоя) са описани бъдещите endpoints:
 *   POST /checkout/create-session {packageId} → {checkoutUrl}
 *   „Frontend just polls /me to see latest purchases"
 *
 * Тук ги имплементираме с истински Stripe Checkout (hosted page):
 *   POST /api/checkout/create-session  → създава Stripe Checkout Session
 *   GET  /api/me/purchases             → покупките на потребителя
 *   GET  /api/packages                 → всички активни пакети (публично)
 *
 * Потокът:
 *   1. Frontend: POST /api/checkout/create-session {packageId}
 *   2. Backend: създава Session, връща checkoutUrl (Stripe hosted страница)
 *   3. Потребителят плаща на Stripe
 *   4. Stripe вика webhook-а (checkout.session.completed)
 *   5. Webhook-ът записва покупката → потребителят има достъп
 */

import { Router } from 'express';
import Stripe from 'stripe';
import { authenticate, asyncHandler } from '../middleware/auth';
import { db } from '../db';
import { config } from '../config';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16' as Stripe.LatestApiVersion,
});

const router = Router();

/**
 * GET /api/packages
 * Всички активни пакети — публично (сайтът ги показва и без вход).
 */
router.get(
  '/packages',
  asyncHandler(async (_req, res) => {
    const packages = await db.manyOrNone(
      `SELECT id, name, description, price_eur, is_bundle
       FROM packages WHERE is_active = true ORDER BY is_bundle, name`
    );
    res.json({ success: true, data: packages, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/checkout/create-session
 * Body: { packageId: string }
 * Създава Stripe Checkout Session за еднократно плащане.
 */
router.post(
  '/checkout/create-session',
  authenticate,
  asyncHandler(async (req, res) => {
    const { packageId } = req.body;

    if (!packageId || typeof packageId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid Package',
        message: 'packageId е задължителен',
      });
    }

    const pkg = await db.oneOrNone<any>(
      'SELECT * FROM packages WHERE id = $1 AND is_active = true',
      [packageId]
    );
    if (!pkg) {
      return res.status(404).json({
        success: false,
        error: 'Package Not Found',
        message: 'Пакетът не съществува или не е активен',
      });
    }

    // Вече купен?
    const existing = await db.oneOrNone(
      `SELECT id FROM purchases WHERE user_id = $1 AND package_id = $2 AND status = 'completed'`,
      [req.user!.user_id, packageId]
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Already Purchased',
        message: 'Вече притежаваш този пакет',
      });
    }

    const user = await db.one<any>('SELECT email FROM users WHERE id = $1', [
      req.user!.user_id,
    ]);

    const frontendUrl = process.env.FRONTEND_URL || config.corsOrigin;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // еднократно плащане (не subscription)
      allow_promotion_codes: true, // промо кодове (създават се в Stripe Dashboard → Coupons)
      customer_email: user.email,
      // Ако пакетът има настроена цена в Stripe Dashboard — ползвай нея;
      // иначе цената идва от базата (по-лесно за старт)
      line_items: pkg.stripe_price_id
        ? [{ price: pkg.stripe_price_id, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'eur',
                unit_amount: Math.round(Number(pkg.price_eur) * 100),
                product_data: {
                  name: pkg.name,
                  description: 'Law+ — lifetime достъп, обновления до 2027',
                },
              },
              quantity: 1,
            },
          ],
      metadata: {
        user_id: req.user!.user_id,
        package_id: packageId,
      },
      success_url: `${frontendUrl}/#/dashboard?purchase=success`,
      cancel_url: `${frontendUrl}/#/packages?purchase=canceled`,
    });

    // Запис на pending покупка (webhook-ът я маркира completed)
    await db.none(
      `INSERT INTO purchases (user_id, package_id, stripe_session_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, 'EUR', 'pending')
       ON CONFLICT (user_id, package_id) DO UPDATE SET
         stripe_session_id = $3, status = 'pending'`,
      [req.user!.user_id, packageId, session.id, pkg.price_eur]
    );

    res.json({
      success: true,
      data: { checkoutUrl: session.url },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/me/purchases
 * Покупките на текущия потребител — сайтът ги ползва, за да знае
 * кои пакети са отключени.
 */
router.get(
  '/me/purchases',
  authenticate,
  asyncHandler(async (req, res) => {
    const purchases = await db.manyOrNone(
      `SELECT p.package_id, p.amount, p.currency, p.status, p.created_at, pk.name
       FROM purchases p
       JOIN packages pk ON pk.id = p.package_id
       WHERE p.user_id = $1 AND p.status = 'completed'
       ORDER BY p.created_at DESC`,
      [req.user!.user_id]
    );
    res.json({ success: true, data: purchases, timestamp: new Date().toISOString() });
  })
);

export default router;
