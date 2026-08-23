/**
 * Stripe Service - Payment processing and subscription management
 * Handles one-time payments and recurring subscriptions via Stripe
 */

import Stripe from 'stripe';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { ForbiddenError, NotFoundError, ValidationError } from '../types';

// Initialize Stripe (key comes from environment)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export interface StripeProduct {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  currency: string;
  billing_interval: 'monthly' | 'yearly' | 'one-time';
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  product_id: string;
  status: string; // active, canceled, past_due, unpaid
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Payment {
  id: string;
  user_id: string;
  stripe_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export class StripeService {
  /**
   * Get or create Stripe customer for user
   */
  static async getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string> {
    // Check if user already has Stripe customer ID
    const user = await db.oneOrNone<any>(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );

    if (user?.stripe_customer_id) {
      return user.stripe_customer_id;
    }

    // Create new customer in Stripe
    const customer = await stripe.customers.create({
      email,
      name: name || email,
      metadata: {
        user_id: userId,
      },
    });

    // Save customer ID to database
    await db.none(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customer.id, userId]
    );

    return customer.id;
  }

  /**
   * Create payment intent for one-time payment
   */
  static async createPaymentIntent(
    userId: string,
    amount: number,
    currency: string = 'usd',
    description: string = 'Pravo Academy Course Purchase',
    metadata?: Record<string, any>
  ): Promise<{ client_secret: string; payment_intent_id: string }> {
    // ПОПРАВКА: в users няма `full_name` — колоната е `name`; псевдонимът пази полето.
    const user = await db.one<any>('SELECT email, name AS full_name FROM users WHERE id = $1', [userId]);

    const customerId = await this.getOrCreateCustomer(userId, user.email, user.full_name);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: customerId,
      description,
      metadata: {
        user_id: userId,
        ...(metadata || {}),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      client_secret: paymentIntent.client_secret || '',
      payment_intent_id: paymentIntent.id,
    };
  }

  /**
   * Confirm payment after client-side processing
   */
  static async confirmPayment(
    paymentIntentId: string,
    userId: string,
    description: string
  ): Promise<Payment> {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // ПОПРАВКА (IDOR): paymentIntentId идва от клиента, а досега никой не
    // проверяваше чий е. Нападател подаваше чужд intent и плащането се
    // вписваше НА НЕГОВО ИМЕ; истинският платец после не получаваше своя
    // запис, защото stripe_payment_id е UNIQUE. Единственият надежден
    // собственик е metadata.user_id, който createPaymentIntent записва.
    if (paymentIntent.metadata?.user_id !== userId) {
      throw new ForbiddenError('Плащането принадлежи на друг потребител');
    }

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not successful: ${paymentIntent.status}`);
    }

    // Идемпотентност: повторно потвърждаване на същия intent не бива да
    // прави втори запис (UNIQUE щеше да гръмне с 500), а вече присвоен
    // чужд запис не бива да се връща на друг потребител.
    const existing = await db.oneOrNone<any>(
      'SELECT * FROM payments WHERE stripe_payment_id = $1',
      [paymentIntentId]
    );

    if (existing) {
      if (existing.user_id !== userId) {
        throw new ForbiddenError('Плащането принадлежи на друг потребител');
      }

      return {
        id: existing.id,
        user_id: existing.user_id,
        stripe_payment_id: existing.stripe_payment_id,
        amount: Number(existing.amount),
        currency: existing.currency,
        status: existing.status,
        description: existing.description,
        metadata: existing.metadata,
        created_at: new Date(existing.created_at),
      };
    }

    // Save payment to database
    const paymentId = uuidv4();
    const amount = (paymentIntent.amount || 0) / 100; // Convert from cents

    await db.none(
      `INSERT INTO payments (id, user_id, stripe_payment_id, amount, currency, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        paymentId,
        userId,
        paymentIntentId,
        amount,
        paymentIntent.currency || 'usd',
        'completed',
        description,
      ]
    );

    return {
      id: paymentId,
      user_id: userId,
      stripe_payment_id: paymentIntentId,
      amount,
      currency: paymentIntent.currency || 'usd',
      status: 'completed',
      description,
      created_at: new Date(),
    };
  }

  /**
   * Create subscription
   */
  static async createSubscription(
    userId: string,
    priceId: string,
    trialDays?: number
  ): Promise<Subscription> {
    // ПОПРАВКА: в users няма `full_name` — колоната е `name`; псевдонимът пази полето.
    const user = await db.one<any>('SELECT email, name AS full_name FROM users WHERE id = $1', [userId]);

    const customerId = await this.getOrCreateCustomer(userId, user.email, user.full_name);

    // Create subscription in Stripe
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        user_id: userId,
      },
    });

    // Save subscription to database
    const dbSubscription = await db.one<any>(
      `INSERT INTO subscriptions (id, user_id, stripe_subscription_id, stripe_customer_id, product_id, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        uuidv4(),
        userId,
        subscription.id,
        customerId,
        subscription.items.data[0]?.price?.product?.toString() || '',
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
      ]
    );

    return {
      id: dbSubscription.id,
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      product_id: dbSubscription.product_id,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  /**
   * Get user subscription
   */
  static async getUserSubscription(userId: string): Promise<Subscription | null> {
    const subscription = await db.oneOrNone<any>(
      `SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (!subscription) return null;

    // Get current status from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

    return {
      id: subscription.id,
      user_id: userId,
      stripe_subscription_id: subscription.stripe_subscription_id,
      stripe_customer_id: subscription.stripe_customer_id,
      product_id: subscription.product_id,
      status: stripeSubscription.status,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000),
      cancel_at_period_end: stripeSubscription.cancel_at_period_end || false,
      created_at: new Date(subscription.created_at),
      updated_at: new Date(),
    };
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(userId: string, immediately: boolean = false): Promise<void> {
    const subscription = await db.one<any>(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Cancel in Stripe
    if (immediately) {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    } else {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    // Update in database
    await db.none(
      `UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = $1 WHERE user_id = $2`,
      [immediately ? true : false, userId]
    );
  }

  /**
   * Update subscription
   */
  static async updateSubscription(userId: string, newPriceId: string): Promise<Subscription> {
    const subscription = await db.one<any>(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Update in Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);

    const updatedSubscription = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    // Update in database
    await db.none(
      `UPDATE subscriptions SET product_id = $1, updated_at = NOW() WHERE user_id = $2`,
      [updatedSubscription.items.data[0]?.price?.product?.toString() || '', userId]
    );

    return await this.getUserSubscription(userId) as Subscription;
  }

  /**
   * Get payment history
   */
  /**
   * Възстановяване на сума.
   *
   * ВАЖНО за реда на действията: първо се вика Stripe и чак след потвърждение
   * се пипа базата. Преди тук стоеше само `UPDATE payments SET status =
   * 'refunded'` с коментар, че извикването „би се направило" — тоест системата
   * казваше на администратора „сумата е възстановена", клиентът не получаваше
   * нищо, а счетоводството показваше възстановяване, което не е станало.
   */
  static async createRefund(
    paymentId: string,
    amount?: number,
    reason?: string,
  ): Promise<{ refundId: string; stripeRefundId: string; amount: number; status: string }> {
    const payment = await db.oneOrNone<any>('SELECT * FROM payments WHERE id = $1', [paymentId]);
    if (!payment) {
      throw new NotFoundError('Плащането не съществува');
    }
    if (payment.status === 'refunded') {
      throw new ValidationError('Плащането вече е възстановено');
    }
    if (!payment.stripe_payment_id) {
      throw new ValidationError('Плащането няма идентификатор в Stripe и не може да бъде възстановено');
    }

    // Stripe работи в стотинки; частично възстановяване се подава изрично.
    const suma = amount != null ? Math.round(amount * 100) : undefined;
    if (suma != null && suma > Math.round(Number(payment.amount) * 100)) {
      throw new ValidationError('Сумата за възстановяване надхвърля платената');
    }

    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_id,
      ...(suma != null ? { amount: suma } : {}),
      ...(reason ? { metadata: { reason } } : {}),
    });

    // Едва сега пипаме базата — и то в транзакция, за да не остане запис за
    // възстановяване без съответната промяна в плащането или обратното.
    const refundId = uuidv4();
    const vazstanoveno = refund.amount / 100;
    const plnoVazstanovyavane = vazstanoveno >= Number(payment.amount);

    await db.tx(async (t) => {
      await t.none(
        `INSERT INTO refunds (id, user_id, payment_id, stripe_refund_id, amount, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [refundId, payment.user_id, paymentId, refund.id, vazstanoveno, reason || null, refund.status || 'pending'],
      );
      await t.none(
        `UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1`,
        [paymentId, plnoVazstanovyavane ? 'refunded' : 'partially_refunded'],
      );
    });

    return {
      refundId,
      stripeRefundId: refund.id,
      amount: vazstanoveno,
      status: refund.status || 'pending',
    };
  }

  static async getPaymentHistory(userId: string, limit: number = 50): Promise<Payment[]> {
    const payments = await db.manyOrNone<any>(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );

    return payments.map((p: any) => ({
      id: p.id,
      user_id: p.user_id,
      stripe_payment_id: p.stripe_payment_id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      description: p.description,
      metadata: p.metadata,
      created_at: new Date(p.created_at),
    }));
  }

  /**
   * Get all invoices for user
   */
  static async getUserInvoices(userId: string): Promise<any[]> {
    const subscription = await db.oneOrNone<any>(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (!subscription) {
      return [];
    }

    const invoices = await stripe.invoices.list({
      customer: subscription.stripe_customer_id,
      limit: 100,
    });

    return invoices.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amount: (invoice.amount_due || 0) / 100,
      currency: invoice.currency,
      status: invoice.status,
      url: invoice.hosted_invoice_url,
      pdf_url: invoice.invoice_pdf,
      date: new Date(invoice.created * 1000),
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    }));
  }

  /**
   * Process webhook event from Stripe
   */
  static async processWebhookEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object);
        break;
    }
  }

  private static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    await db.none(
      `UPDATE subscriptions SET status = $1, current_period_start = $2, current_period_end = $3, updated_at = NOW()
       WHERE stripe_subscription_id = $4`,
      [
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        subscription.id,
      ]
    );
  }

  private static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    await db.none(
      'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2',
      ['canceled', subscription.id]
    );
  }

  private static async handleInvoicePaid(invoice: any): Promise<void> {
    // Update payment status in database
    await db.none(
      `UPDATE payments SET status = 'completed' WHERE stripe_payment_id = $1`,
      [invoice.charge]
    );

    // Extend user access
    const subscription = await db.oneOrNone<any>(
      'SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1',
      [invoice.customer]
    );

    if (subscription) {
      await db.none(
        `UPDATE users SET subscription_status = 'active', subscription_valid_until = NOW() + INTERVAL '1 month'
         WHERE id = $1`,
        [subscription.user_id]
      );
    }
  }

  private static async handleInvoicePaymentFailed(invoice: any): Promise<void> {
    // Update subscription status
    await db.none(
      `UPDATE subscriptions SET status = 'past_due' WHERE stripe_customer_id = $1`,
      [invoice.customer]
    );
  }

  private static async handleChargeRefunded(charge: any): Promise<void> {
    await db.none(
      `UPDATE payments SET status = 'refunded' WHERE stripe_payment_id = $1`,
      [charge.id]
    );
  }

  /**
   * Verify Stripe webhook signature
   */
  static verifyWebhookSignature(body: string, signature: string, webhookSecret: string): any {
    try {
      return stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error: any) {
      throw new Error(`Webhook verification failed: ${error.message}`);
    }
  }

  /**
   * Get subscription metrics
   */
  static async getSubscriptionMetrics(): Promise<any> {
    const active = await db.one<any>(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
    );

    const trialing = await db.one<any>(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'trialing'"
    );

    const canceled = await db.one<any>(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'canceled'"
    );

    const monthlyRecurring = await db.one<any>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments
       WHERE created_at > NOW() - INTERVAL '1 month'`
    );

    return {
      active_subscriptions: parseInt(active.count),
      trialing_subscriptions: parseInt(trialing.count),
      canceled_subscriptions: parseInt(canceled.count),
      monthly_recurring_revenue: parseFloat(monthlyRecurring.total),
    };
  }

  /**
   * List available products/prices
   */
  static async listProducts(): Promise<any[]> {
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    });

    const enriched = [];

    for (const product of products.data) {
      const prices = await stripe.prices.list({
        product: product.id,
        active: true,
      });

      enriched.push({
        id: product.id,
        name: product.name,
        description: product.description,
        metadata: product.metadata,
        prices: prices.data.map((price) => ({
          id: price.id,
          amount: (price.unit_amount || 0) / 100,
          currency: price.currency,
          interval: price.recurring?.interval,
          interval_count: price.recurring?.interval_count,
        })),
      });
    }

    return enriched;
  }
}
