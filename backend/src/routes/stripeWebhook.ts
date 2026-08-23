/**
 * Stripe Webhook Handler - Process events from Stripe
 * This endpoint should be publicly accessible but secured with Stripe signature verification
 */

import { Router, raw } from 'express';
import { StripeService } from '../services/stripeService';
import { WebhookService } from '../services/webhookService';
import { PaymentEmailService } from '../services/paymentEmailService';
import { db } from '../db';
import { asyncHandler } from '../middleware/auth';

/**
 * Помощна: намира потребител по Stripe customer ID.
 * Връща null ако няма — в този случай имейлът просто се пропуска.
 */
async function findUserByCustomer(
  customerId: string | null | undefined
): Promise<{ id: string; email: string; first_name: string } | null> {
  if (!customerId) return null;
  return db.oneOrNone<any>(
    'SELECT id, email, name AS first_name FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );
}

const router = Router();

// Use raw body parser for webhook signature verification
// This middleware must be applied before the route handler
router.use(raw({ type: 'application/json' }));

// ============================================================================
// STRIPE WEBHOOK ENDPOINT
// ============================================================================

/**
 * POST /webhooks/stripe
 * Receive and process events from Stripe
 * Requires: stripe-signature header from Stripe
 * Environment: STRIPE_WEBHOOK_SECRET
 */
router.post(
  '/stripe',
  asyncHandler(async (req, res) => {
    const signature = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing Signature',
        message: 'stripe-signature header is required',
      });
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Webhook Misconfigured',
        message: 'Webhook endpoint not properly configured',
      });
    }

    try {
      // Verify webhook signature
      const event = StripeService.verifyWebhookSignature(
        req.body.toString('utf-8'),
        signature,
        webhookSecret
      );

      // Check if event already processed
      const existingLog = await db.oneOrNone<any>(
        'SELECT * FROM stripe_webhooks_log WHERE event_id = $1',
        [event.id]
      );

      if (existingLog && existingLog.status === 'processed') {
        console.log(`Webhook ${event.id} already processed, skipping`);
        return res.json({ received: true });
      }

      // Log webhook event
      await db.none(
        `INSERT INTO stripe_webhooks_log (event_id, event_type, data, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_id) DO UPDATE SET
         attempt_count = stripe_webhooks_log.attempt_count + 1,
         last_attempted_at = NOW()`,
        [event.id, event.type, JSON.stringify(event.data), 'processing']
      );

      // Process based on event type
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object);
          break;

        case 'charge.succeeded':
          await handleChargeSucceeded(event.data.object);
          break;

        case 'charge.failed':
          await handleChargeFailed(event.data.object);
          break;

        case 'customer.subscription.created':
          await handleSubscriptionCreated(event.data.object);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.created':
          await handleInvoiceCreated(event.data.object);
          break;

        case 'invoice.paid':
          await handleInvoicePaid(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(event.data.object);
          break;

        case 'invoice.payment_action_required':
          await handleInvoiceActionRequired(event.data.object);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object);
          break;

        case 'customer.created':
          await handleCustomerCreated(event.data.object);
          break;

        case 'customer.updated':
          await handleCustomerUpdated(event.data.object);
          break;

        case 'customer.deleted':
          await handleCustomerDeleted(event.data.object);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Mark as processed
      await db.none(
        `UPDATE stripe_webhooks_log SET status = 'processed' WHERE event_id = $1`,
        [event.id]
      );

      res.json({ received: true });
    } catch (error: any) {
      console.error('Stripe webhook error:', error);

      // Log failed attempt
      let event: any = {};
      try {
        event = JSON.parse(req.body.toString('utf-8'));
      } catch (parseError) {
        console.error('Failed to parse webhook body:', parseError);
      }

      try {
        await db.none(
          `INSERT INTO stripe_webhooks_log (event_id, event_type, data, status, error_message)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (event_id) DO UPDATE SET
           status = 'failed',
           error_message = $5,
           attempt_count = stripe_webhooks_log.attempt_count + 1,
           last_attempted_at = NOW()`,
          [event.id || 'unknown', event.type || 'unknown', JSON.stringify(event), 'failed', error.message]
        );
      } catch (dbError) {
        console.error('Failed to log webhook error:', dbError);
      }

      // Return 400 to Stripe to retry (if it's a retryable error)
      res.status(400).json({
        success: false,
        error: 'Webhook Processing Failed',
        message: error.message,
      });
    }
  })
);

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle checkout.session.completed — покупка на пакет от Law+.
 * Това е събитието, което ОТКЛЮЧВА достъпа на потребителя.
 */
async function handleCheckoutCompleted(session: any) {
  console.log(`Processing checkout completed: ${session.id}`);

  const userId = session.metadata?.user_id;
  const packageId = session.metadata?.package_id;

  if (!userId || !packageId) {
    console.warn(`Checkout ${session.id} без user_id/package_id в metadata — пропускам`);
    return;
  }

  // Маркирай покупката като завършена (или я създай, ако pending записът липсва)
  await db.none(
    `INSERT INTO purchases (user_id, package_id, stripe_session_id, stripe_payment_intent, amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'completed')
     ON CONFLICT (user_id, package_id) DO UPDATE SET
       status = 'completed',
       stripe_session_id = $3,
       stripe_payment_intent = $4`,
    [
      userId,
      packageId,
      session.id,
      session.payment_intent || null,
      (session.amount_total || 0) / 100,
      (session.currency || 'eur').toUpperCase(),
    ]
  );

  // Запиши и в payments за общата статистика
  if (session.payment_intent) {
    await db.none(
      `INSERT INTO payments (user_id, stripe_payment_id, amount, currency, status, description)
       VALUES ($1, $2, $3, $4, 'completed', $5)
       ON CONFLICT (stripe_payment_id) DO NOTHING`,
      [
        userId,
        session.payment_intent,
        (session.amount_total || 0) / 100,
        (session.currency || 'eur').toUpperCase(),
        'Пакет: ' + packageId,
      ]
    );
  }

  // Имейл за потвърждение
  const user = await db.oneOrNone<any>(
    'SELECT email, name AS first_name FROM users WHERE id = $1',
    [userId]
  );
  if (user) {
    const pkg = await db.oneOrNone<any>('SELECT name FROM packages WHERE id = $1', [packageId]);
    PaymentEmailService.sendPaymentConfirmation(
      user.email,
      user.first_name,
      (session.amount_total || 0) / 100,
      session.currency || 'eur',
      pkg ? 'Пакет: ' + pkg.name : 'Пакет Law+'
    ).catch((e) => console.error('[email] purchase confirmation:', e));
  }
}

/**
 * Handle charge.succeeded event
 */
async function handleChargeSucceeded(charge: any) {
  console.log(`Processing charge succeeded: ${charge.id}`);

  // Update payment status if exists
  if (charge.payment_intent) {
    await db.none(
      `UPDATE payments SET status = 'completed' WHERE stripe_payment_id = $1`,
      [charge.payment_intent]
    );
  }

  // Имейл за потвърждение (не блокира webhook-а при грешка)
  const user = await findUserByCustomer(charge.customer);
  if (user) {
    PaymentEmailService.sendPaymentConfirmation(
      user.email,
      user.first_name,
      (charge.amount || 0) / 100,
      charge.currency || 'bgn',
      charge.description
    ).catch((e) => console.error('[email] payment confirmation:', e));
  }
}

/**
 * Handle charge.failed event
 */
async function handleChargeFailed(charge: any) {
  console.log(`Processing charge failed: ${charge.id}`);

  if (charge.payment_intent) {
    await db.none(
      `UPDATE payments SET status = 'failed' WHERE stripe_payment_id = $1`,
      [charge.payment_intent]
    );
  }
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(subscription: any) {
  console.log(`Processing subscription created: ${subscription.id}`);

  const customerId = subscription.customer;
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    console.warn(`Subscription ${subscription.id} created without user_id in metadata`);
    return;
  }

  // Verify user exists
  const user = await db.oneOrNone('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) {
    console.warn(`User ${userId} not found for subscription ${subscription.id}`);
    return;
  }

  // Update user subscription status
  await db.none(
    `UPDATE users SET subscription_status = $1 WHERE id = $2`,
    [subscription.status, userId]
  );

  // Приветствен имейл при нов активен/пробен абонамент
  if (['active', 'trialing'].includes(subscription.status)) {
    const userRecord = await db.oneOrNone<any>(
      'SELECT email, name AS first_name FROM users WHERE id = $1',
      [userId]
    );
    if (userRecord) {
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : undefined;
      PaymentEmailService.sendSubscriptionWelcome(
        userRecord.email,
        userRecord.first_name,
        subscription.metadata?.plan_name || 'Абонамент Law+',
        periodEnd
      ).catch((e) => console.error('[email] subscription welcome:', e));
    }
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription: any) {
  console.log(`Processing subscription updated: ${subscription.id}`);

  await StripeService.processWebhookEvent({
    type: 'customer.subscription.updated',
    data: { object: subscription },
  });

  // Update user subscription status
  const subRecord = await db.oneOrNone<any>(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscription.id]
  );

  if (subRecord) {
    await db.none(
      `UPDATE users SET subscription_status = $1 WHERE id = $2`,
      [subscription.status, subRecord.user_id]
    );
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription: any) {
  console.log(`Processing subscription deleted: ${subscription.id}`);

  await StripeService.processWebhookEvent({
    type: 'customer.subscription.deleted',
    data: { object: subscription },
  });

  // Update user subscription status
  const subRecord = await db.oneOrNone<any>(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscription.id]
  );

  if (subRecord) {
    await db.none(
      `UPDATE users SET subscription_status = 'canceled' WHERE id = $1`,
      [subRecord.user_id]
    );

    // Имейл: абонаментът е спрян
    const user = await db.oneOrNone<any>(
      'SELECT email, name AS first_name FROM users WHERE id = $1',
      [subRecord.user_id]
    );
    if (user) {
      const accessUntil = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : undefined;
      PaymentEmailService.sendSubscriptionCanceled(
        user.email,
        user.first_name,
        accessUntil
      ).catch((e) => console.error('[email] subscription canceled:', e));
    }
  }
}

/**
 * Handle invoice created event
 */
async function handleInvoiceCreated(invoice: any) {
  console.log(`Processing invoice created: ${invoice.id}`);

  // Store invoice reference in payment_history
  if (invoice.customer && invoice.subscription) {
    const subscription = await db.oneOrNone<any>(
      'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
      [invoice.subscription]
    );

    if (subscription) {
      const amount = (invoice.amount_due || 0) / 100; // Convert from cents
      await db.none(
        `INSERT INTO payment_history (user_id, subscription_id, amount, currency, type, status, stripe_invoice_id)
         VALUES ($1, (SELECT id FROM subscriptions WHERE stripe_subscription_id = $2), $3, $4, $5, $6, $7)`,
        [subscription.user_id, invoice.subscription, amount, invoice.currency || 'usd', 'invoice_created', 'pending', invoice.id]
      );
    }
  }
}

/**
 * Handle invoice paid event
 */
async function handleInvoicePaid(invoice: any) {
  console.log(`Processing invoice paid: ${invoice.id}`);

  await StripeService.processWebhookEvent({
    type: 'invoice.paid',
    data: { object: invoice },
  });

  // Update payment history
  const subscription = await db.oneOrNone<any>(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [invoice.subscription]
  );

  if (subscription) {
    await db.none(
      `UPDATE payment_history SET status = 'succeeded' WHERE stripe_invoice_id = $1`,
      [invoice.id]
    );
  }
}

/**
 * Handle invoice payment failed event
 */
async function handleInvoicePaymentFailed(invoice: any) {
  console.log(`Processing invoice payment failed: ${invoice.id}`);

  await StripeService.processWebhookEvent({
    type: 'invoice.payment_failed',
    data: { object: invoice },
  });

  // Update subscription status to past_due
  const subscription = await db.oneOrNone<any>(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [invoice.subscription]
  );

  if (subscription) {
    await db.none(
      `UPDATE users SET subscription_status = 'past_due' WHERE id = $1`,
      [subscription.user_id]
    );

    // Имейл: неуспешно плащане — молба за обновяване на картата
    const user = await db.oneOrNone<any>(
      'SELECT email, name AS first_name FROM users WHERE id = $1',
      [subscription.user_id]
    );
    if (user) {
      PaymentEmailService.sendPaymentFailed(
        user.email,
        user.first_name,
        (invoice.amount_due || 0) / 100,
        invoice.currency || 'bgn'
      ).catch((e) => console.error('[email] payment failed notice:', e));
    }
  }
}

/**
 * Handle invoice payment action required event
 */
async function handleInvoiceActionRequired(invoice: any) {
  console.log(`Processing invoice action required: ${invoice.id}`);

  const subscription = await db.oneOrNone<any>(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [invoice.subscription]
  );

  if (subscription) {
    // Trigger webhook event for user action required
    await WebhookService.triggerEvent('payment.action_required', {
      user_id: subscription.user_id,
      invoice_id: invoice.id,
      payment_intent: invoice.payment_intent,
      hosted_invoice_url: invoice.hosted_invoice_url,
    });
  }
}

/**
 * Handle charge refunded event
 */
async function handleChargeRefunded(charge: any) {
  console.log(`Processing charge refunded: ${charge.id}`);

  await StripeService.processWebhookEvent({
    type: 'charge.refunded',
    data: { object: charge },
  });

  // Record refund in database
  if (charge.refunds && charge.refunds.data.length > 0) {
    const refund = charge.refunds.data[0];
    const payment = await db.oneOrNone<any>(
      'SELECT id, user_id FROM payments WHERE stripe_payment_id = $1',
      [charge.payment_intent]
    );

    if (payment && refund.id) {
      await db.none(
        `INSERT INTO refunds (user_id, payment_id, stripe_refund_id, amount, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (stripe_refund_id) DO NOTHING`,
        [payment.user_id, payment.id, refund.id, refund.amount / 100, refund.status]
      );

      // Имейл за възстановената сума
      const user = await db.oneOrNone<any>(
        'SELECT email, name AS first_name FROM users WHERE id = $1',
        [payment.user_id]
      );
      if (user) {
        PaymentEmailService.sendRefundConfirmation(
          user.email,
          user.first_name,
          refund.amount / 100,
          charge.currency || 'bgn'
        ).catch((e) => console.error('[email] refund confirmation:', e));
      }
    }
  }
}

/**
 * Handle customer created event
 */
async function handleCustomerCreated(customer: any) {
  console.log(`Processing customer created: ${customer.id}`);

  // Customer ID is already stored in users table when StripeService.getOrCreateCustomer is called
  // This is just for logging/syncing purposes
}

/**
 * Handle customer updated event
 */
async function handleCustomerUpdated(customer: any) {
  console.log(`Processing customer updated: ${customer.id}`);

  // Update user info if customer details changed
  if (customer.metadata?.user_id) {
    await db.none(
      `UPDATE users SET updated_at = NOW() WHERE stripe_customer_id = $1`,
      [customer.id]
    );
  }
}

/**
 * Handle customer deleted event
 */
async function handleCustomerDeleted(customer: any) {
  console.log(`Processing customer deleted: ${customer.id}`);

  // Clear customer ID from users table
  await db.none(
    `UPDATE users SET stripe_customer_id = NULL WHERE stripe_customer_id = $1`,
    [customer.id]
  );
}

export default router;
