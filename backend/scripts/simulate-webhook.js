#!/usr/bin/env node
/**
 * ============================================================
 * Stripe Webhook Симулатор — тествай webhook-и локално
 * без истински Stripe акаунт.
 *
 * Използване:
 *   node scripts/simulate-webhook.js charge.succeeded
 *   node scripts/simulate-webhook.js invoice.payment_failed
 *   node scripts/simulate-webhook.js --list
 *
 * Изисква STRIPE_WEBHOOK_SECRET в .env (същия като сървъра).
 * Подписва заявката точно както Stripe би я подписал.
 * ============================================================
 */

const crypto = require('crypto');
const http = require('http');
const path = require('path');

// Зареди .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const HOST = process.env.WEBHOOK_HOST || 'localhost';
const PORT = process.env.PORT || 3000;

/* ---------- Примерни събития ---------- */

const CUSTOMER_ID = process.env.SIM_CUSTOMER_ID || 'cus_demo_simulator';

const EVENTS = {
  'checkout.session.completed': {
    id: 'cs_sim_' + Date.now(),
    object: 'checkout.session',
    mode: 'payment',
    payment_intent: 'pi_sim_checkout_' + Date.now(),
    amount_total: 3500,
    currency: 'eur',
    metadata: {
      user_id: process.env.SIM_USER_ID || 'a0000000-0000-4000-8000-000000000002',
      package_id: process.env.SIM_PACKAGE_ID || 'krb',
    },
  },
  'charge.succeeded': {
    id: 'ch_sim_' + Date.now(),
    object: 'charge',
    amount: 2999,
    currency: 'bgn',
    customer: CUSTOMER_ID,
    payment_intent: 'pi_sim_' + Date.now(),
    description: 'Месечен план — Law+ (симулация)',
    status: 'succeeded',
  },
  'charge.failed': {
    id: 'ch_sim_' + Date.now(),
    object: 'charge',
    amount: 2999,
    currency: 'bgn',
    customer: CUSTOMER_ID,
    payment_intent: 'pi_sim_' + Date.now(),
    status: 'failed',
    failure_message: 'Your card was declined.',
  },
  'customer.subscription.created': {
    id: 'sub_sim_' + Date.now(),
    object: 'subscription',
    customer: CUSTOMER_ID,
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    metadata: { user_id: process.env.SIM_USER_ID || 'a0000000-0000-4000-8000-000000000002' },
  },
  'customer.subscription.deleted': {
    id: 'sub_sim_' + Date.now(),
    object: 'subscription',
    customer: CUSTOMER_ID,
    status: 'canceled',
    current_period_end: Math.floor(Date.now() / 1000) + 15 * 24 * 3600,
  },
  'invoice.paid': {
    id: 'in_sim_' + Date.now(),
    object: 'invoice',
    customer: CUSTOMER_ID,
    subscription: 'sub_sim_existing',
    amount_due: 2999,
    amount_paid: 2999,
    currency: 'bgn',
    status: 'paid',
  },
  'invoice.payment_failed': {
    id: 'in_sim_' + Date.now(),
    object: 'invoice',
    customer: CUSTOMER_ID,
    subscription: 'sub_sim_existing',
    amount_due: 2999,
    currency: 'bgn',
    status: 'open',
  },
  'charge.refunded': {
    id: 'ch_sim_' + Date.now(),
    object: 'charge',
    amount: 2999,
    currency: 'bgn',
    customer: CUSTOMER_ID,
    payment_intent: 'pi_demo_000000000002',
    refunds: {
      data: [
        {
          id: 're_sim_' + Date.now(),
          amount: 2999,
          status: 'succeeded',
        },
      ],
    },
  },
};

/* ---------- CLI ---------- */

const eventType = process.argv[2];

if (!eventType || eventType === '--list' || eventType === '-l') {
  console.log('Налични събития:\n');
  Object.keys(EVENTS).forEach((e) => console.log('  ' + e));
  console.log('\nИзползване: node scripts/simulate-webhook.js <събитие>');
  process.exit(0);
}

if (!EVENTS[eventType]) {
  console.error(`❌ Непознато събитие: ${eventType}`);
  console.error('Пусни с --list за наличните събития.');
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error('❌ STRIPE_WEBHOOK_SECRET липсва в .env');
  console.error('Добави например: STRIPE_WEBHOOK_SECRET=whsec_test_simulator');
  process.exit(1);
}

/* ---------- Изпращане с валиден Stripe подпис ---------- */

const event = {
  id: 'evt_sim_' + Date.now(),
  object: 'event',
  api_version: '2023-10-16',
  created: Math.floor(Date.now() / 1000),
  type: eventType,
  data: { object: EVENTS[eventType] },
};

const payload = JSON.stringify(event);
const timestamp = Math.floor(Date.now() / 1000);

// Точно както Stripe генерира подписа: HMAC-SHA256 върху "timestamp.payload"
const signedPayload = `${timestamp}.${payload}`;
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(signedPayload)
  .digest('hex');

const sigHeader = `t=${timestamp},v1=${signature}`;

const req = http.request(
  {
    host: HOST,
    port: PORT,
    path: '/webhooks/stripe',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'stripe-signature': sigHeader,
    },
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      const icon = res.statusCode === 200 ? '✅' : '❌';
      console.log(`${icon} ${eventType} → HTTP ${res.statusCode}`);
      console.log(`   Отговор: ${body}`);
      if (res.statusCode !== 200) process.exit(1);
    });
  }
);

req.on('error', (err) => {
  console.error(`❌ Сървърът не отговаря на ${HOST}:${PORT} — пуснат ли е? (npm run dev)`);
  console.error('   ' + err.message);
  process.exit(1);
});

console.log(`📤 Изпращам ${eventType} към http://${HOST}:${PORT}/webhooks/stripe ...`);
req.write(payload);
req.end();
