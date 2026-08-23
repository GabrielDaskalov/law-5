# Stripe Implementation Checklist

## Overview
This checklist guides you through setting up Stripe payment processing for Pravo Academy.

**Time Estimate**: 2-3 hours for complete setup  
**Difficulty**: Medium  
**Priority**: CRITICAL

---

## Phase 1: Stripe Account & Configuration (30 minutes)

### ✅ Stripe Account Setup
- [ ] Create Stripe account at https://stripe.com
- [ ] Complete identity verification
- [ ] Enable test mode
- [ ] Copy API keys to `.env` file:
  - `STRIPE_SECRET_KEY` (from API Keys page)
  - `STRIPE_PUBLISHABLE_KEY` (from API Keys page)

### ✅ Create Products in Stripe Dashboard

**Product 1: Premium Monthly**
- [ ] Name: "Premium Monthly Access"
- [ ] Description: "Full access to premium learning materials"
- [ ] Create monthly price: $9.99/month
- [ ] Copy Price ID to `.env` as `STRIPE_PRICE_MONTHLY=price_xxx`

**Product 2: Premium Yearly**
- [ ] Name: "Premium Yearly Access"
- [ ] Description: "Full access to premium learning materials for one year"
- [ ] Create yearly price: $99.99/year
- [ ] Copy Price ID to `.env` as `STRIPE_PRICE_YEARLY=price_xxx`

**Product 3: Lifetime Access** (Optional)
- [ ] Name: "Lifetime Access"
- [ ] Description: "Permanent access to all content"
- [ ] Create one-time price: $299.99
- [ ] Copy Price ID to `.env` as `STRIPE_PRICE_LIFETIME=price_xxx`

### ✅ Configure Webhook Endpoint
- [ ] Go to https://dashboard.stripe.com/webhooks
- [ ] Create new webhook endpoint:
  - URL: `https://yourdomain.com/webhooks/stripe`
  - Events: Select all events for:
    - Charges (charge.*)
    - Customers (customer.*)
    - Invoices (invoice.*)
- [ ] Copy Signing Secret to `.env` as `STRIPE_WEBHOOK_SECRET=whsec_xxx`

### ✅ Configure Webhook Events
Select these events in Stripe Webhook configuration:
- [ ] `charge.succeeded`
- [ ] `charge.failed`
- [ ] `customer.subscription.created`
- [ ] `customer.subscription.updated`
- [ ] `customer.subscription.deleted`
- [ ] `invoice.created`
- [ ] `invoice.paid`
- [ ] `invoice.payment_failed`
- [ ] `charge.refunded`
- [ ] `customer.created`
- [ ] `customer.updated`
- [ ] `customer.deleted`

---

## Phase 2: Backend Implementation (Already Done! ✅)

### ✅ Files Created

**Services:**
- [x] `src/services/stripeService.ts` - Stripe API integration (600+ lines)
  - Payment processing
  - Subscription management
  - Webhook verification
  - Product listing
  - Metrics calculation

**Routes:**
- [x] `src/routes/payments.ts` - Payment endpoints (400+ lines)
  - Create payment intent
  - Confirm payment
  - Payment history
  - Invoice management
  - Refund processing
  - Payment statistics

- [x] `src/routes/subscriptions.ts` - Subscription endpoints (300+ lines)
  - Create subscription
  - Get current subscription
  - Update subscription (upgrade/downgrade)
  - Cancel subscription
  - Subscription history
  - Product listing

- [x] `src/routes/stripeWebhook.ts` - Webhook handler (500+ lines)
  - Event verification
  - 10+ event handlers
  - Database synchronization
  - Idempotent processing

**Database:**
- [x] `src/db/migrations/003_create_stripe_tables.sql` - 8 tables
  - `payments`
  - `subscriptions`
  - `subscription_products`
  - `payment_history`
  - `stripe_webhooks_log`
  - `customer_payment_methods`
  - `refunds`
  - `billing_portal_sessions`
  - Views: `active_subscriptions`, `monthly_recurring_revenue`, `payment_statistics`

**Tests:**
- [x] `src/services/__tests__/stripe.test.ts` - Comprehensive test suite

**Configuration:**
- [x] Updated `src/index.ts` with new routes
  - `/api/payments`
  - `/api/subscriptions`
  - `/webhooks/stripe`

---

## Phase 3: Database Setup (30 minutes)

### ✅ Execute Migration
```bash
# Connect to your database and run:
psql -U postgres -d pravo_academy -f src/db/migrations/003_create_stripe_tables.sql
```

### ✅ Verify Tables Created
```bash
psql -d pravo_academy -c "\dt payments subscriptions refunds"
```

Expected output: 8 tables created with proper indexes and triggers.

### ✅ Test Database Functions
```bash
# Test trigger for subscription status sync
psql -d pravo_academy -c "SELECT * FROM subscriptions LIMIT 1"

# Verify views exist
psql -d pravo_academy -c "SELECT * FROM active_subscriptions LIMIT 1"
```

---

## Phase 4: Environment Configuration (10 minutes)

### ✅ Update `.env` File

```bash
# Stripe API Keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# Stripe API Configuration
STRIPE_API_VERSION=2023-10-16

# Optional: Product Price IDs
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
STRIPE_PRICE_YEARLY=price_xxxxxxxxxxxx
STRIPE_PRICE_LIFETIME=price_xxxxxxxxxxxx

# Webhook Settings
WEBHOOK_MAX_RETRIES=3
WEBHOOK_TIMEOUT=10000

# Payment Settings
PAYMENT_CURRENCY=usd
PAYMENT_MAX_AMOUNT=99999.99
```

### ✅ Verify Environment Variables
```bash
# Check if .env is loaded correctly
npm run dev
# Should see no "STRIPE_SECRET_KEY not configured" errors
```

---

## Phase 5: Local Testing with Stripe CLI (30 minutes)

### ✅ Install Stripe CLI
- [ ] macOS: `brew install stripe/stripe-cli/stripe`
- [ ] Windows: Download from https://github.com/stripe/stripe-cli/releases
- [ ] Linux: `sudo apt-get install stripe`

### ✅ Authenticate with Stripe
```bash
stripe login
# This opens browser to authenticate
```

### ✅ Forward Webhooks Locally
```bash
# In one terminal:
stripe listen --forward-to localhost:3000/webhooks/stripe
# Copy the signing secret and update .env STRIPE_WEBHOOK_SECRET
```

### ✅ Test Webhook Events
```bash
# In another terminal:
stripe trigger charge.succeeded
stripe trigger customer.subscription.created
stripe trigger invoice.paid
# Check your backend logs to see events being processed
```

---

## Phase 6: Frontend Integration (1 hour)

### ✅ Install Stripe Libraries
```bash
npm install @stripe/react-stripe-js @stripe/stripe-js
```

### ✅ Create Payment Component
See `STRIPE_INTEGRATION_GUIDE.md` for complete examples:
- Payment form with CardElement
- Payment intent creation
- Payment confirmation flow

### ✅ Create Subscription Component
- List available products
- Subscribe button for each plan
- Handle subscription creation
- Show subscription status

### ✅ Add Payment History Component
- Display user's payment history
- Show invoice links
- Display refund status

### ✅ Add Subscription Management
- Show current subscription
- Upgrade/downgrade option
- Cancel subscription button
- Display renewal date

---

## Phase 7: Testing (30 minutes)

### ✅ Test Payment Creation
```bash
curl -X POST http://localhost:3000/api/payments/create-intent \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.99,
    "description": "Premium Access"
  }'
```

### ✅ Test Subscription Creation
```bash
curl -X POST http://localhost:3000/api/subscriptions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price_id": "price_xxxx",
    "trial_days": 7
  }'
```

### ✅ Test Payment Endpoints
- [ ] `GET /api/payments/history` - View payment history
- [ ] `GET /api/payments/invoices` - View invoices
- [ ] `POST /api/payments/{id}/refund` (admin) - Test refund

### ✅ Test Subscription Endpoints
- [ ] `GET /api/subscriptions/current` - Get active subscription
- [ ] `GET /api/subscriptions/products` - List available plans
- [ ] `PUT /api/subscriptions/current` - Upgrade/downgrade
- [ ] `DELETE /api/subscriptions/current` - Cancel subscription
- [ ] `GET /api/subscriptions/metrics` (admin) - View metrics

### ✅ Test with Stripe Test Cards
Use these card numbers in test mode:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Require Authentication**: 4000 0025 0000 3155
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3-4 digits

### ✅ Test Webhook Processing
- [ ] Check `stripe_webhooks_log` table for events
- [ ] Verify subscription status updates
- [ ] Verify payment status updates
- [ ] Check for any failed events

### ✅ Run Test Suite
```bash
npm test -- stripe.test.ts
```

---

## Phase 8: Deployment (1 hour)

### ✅ Production Stripe Account
- [ ] Create Stripe production account
- [ ] Complete business verification
- [ ] Go live (Enable live mode)
- [ ] Obtain production API keys

### ✅ Update Production Environment
```bash
# Update .env for production
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_live_xxxxxxxxxxxx
```

### ✅ Deploy Backend
```bash
# Deploy to your hosting platform (AWS, Heroku, etc.)
git push heroku main

# Or for Docker:
docker build -t pravo-academy .
docker push your-registry/pravo-academy
```

### ✅ Configure Production Webhook
- [ ] Go to Stripe dashboard (production mode)
- [ ] Create webhook endpoint with production URL
- [ ] Copy signing secret to production environment

### ✅ Verify Production Setup
```bash
# Test production payment endpoint
curl https://yourdomain.com/api/payments/create-intent \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"amount": 99.99, "description": "Test"}'
```

### ✅ Monitor Production
- [ ] Set up error tracking (Sentry)
- [ ] Monitor webhook logs
- [ ] Set up alerts for failed payments
- [ ] Track subscription metrics

---

## Phase 9: Security & Compliance (15 minutes)

### ✅ Security Checklist
- [ ] All API keys in environment variables
- [ ] HTTPS enforced in production
- [ ] Webhook signature verification enabled
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] SQL injection prevention verified
- [ ] No PII in logs

### ✅ PCI Compliance
- [ ] Using Stripe Elements (not handling raw card data)
- [ ] SSL/TLS certificate valid
- [ ] Regular security updates applied
- [ ] Access logs monitored

### ✅ Data Protection
- [ ] Payments table encrypted at rest
- [ ] Backup strategy implemented
- [ ] Audit logging enabled
- [ ] Data retention policy configured

---

## Phase 10: Monitoring & Maintenance (Ongoing)

### ✅ Daily Tasks
- [ ] Check webhook logs for errors
- [ ] Monitor failed payments
- [ ] Check for duplicate webhooks

### ✅ Weekly Tasks
- [ ] Review payment statistics
- [ ] Check subscription metrics
- [ ] Verify no stuck webhooks

### ✅ Monthly Tasks
- [ ] Review refunds
- [ ] Analyze revenue metrics
- [ ] Update API version if needed
- [ ] Check for Stripe deprecations

### ✅ Monitoring Queries
```bash
# Failed payments
SELECT * FROM stripe_webhooks_log WHERE status = 'failed' ORDER BY created_at DESC;

# Subscription metrics
SELECT * FROM monthly_recurring_revenue;

# Payment statistics
SELECT * FROM payment_statistics;
```

---

## Quick Reference: Files & Routes

### Services
- `src/services/stripeService.ts` - Core Stripe integration

### Routes
- `POST /api/payments/create-intent` - Create payment
- `POST /api/payments/confirm` - Confirm payment
- `GET /api/payments/history` - Payment history
- `GET /api/payments/invoices` - User invoices
- `POST /api/payments/:id/refund` - Refund (admin)
- `GET /api/payments/stats` - Stats (admin)

- `POST /api/subscriptions` - Create subscription
- `GET /api/subscriptions/current` - Get active subscription
- `PUT /api/subscriptions/current` - Upgrade/downgrade
- `DELETE /api/subscriptions/current` - Cancel
- `GET /api/subscriptions/products` - Available plans
- `GET /api/subscriptions/metrics` - Metrics (admin)

- `POST /webhooks/stripe` - Webhook endpoint (no auth)

### Database Tables
- `payments` - One-time payments
- `subscriptions` - Active subscriptions
- `subscription_products` - Available plans
- `payment_history` - Transaction log
- `refunds` - Refund records
- `customer_payment_methods` - Stored methods
- `stripe_webhooks_log` - Webhook log
- `billing_portal_sessions` - Portal access

---

## Troubleshooting

### Issue: "STRIPE_SECRET_KEY not configured"
**Solution**: Check `.env` file and restart server

### Issue: Webhooks not processing
**Solution**: Verify webhook secret and endpoint is accessible

### Issue: Payment intent creation fails
**Solution**: Check Stripe API keys are correct

### Issue: Subscription not syncing
**Solution**: Check webhook logs for errors

### Issue: Rate limiting on payments
**Solution**: Check rate limit config in `.env`

---

## Success Criteria

You'll know the implementation is complete when:

✅ All 8 database tables created  
✅ Payment endpoints returning 200 status  
✅ Subscription endpoints working  
✅ Webhooks being processed and logged  
✅ Payment history showing in database  
✅ Subscription status updating correctly  
✅ Tests passing  
✅ No errors in production logs  

---

## Support & Resources

- **Backend Code**: `src/services/stripeService.ts`
- **API Guide**: `STRIPE_INTEGRATION_GUIDE.md`
- **Implementation Examples**: `src/routes/payments.ts`, `src/routes/subscriptions.ts`
- **Test Examples**: `src/services/__tests__/stripe.test.ts`
- **Stripe Docs**: https://stripe.com/docs
- **Stripe API**: https://stripe.com/docs/api

---

## Status

**Backend Implementation**: ✅ COMPLETE (600+ lines of production code)  
**Database Schema**: ✅ COMPLETE (8 tables, 3 views, 4 triggers)  
**Webhook Handler**: ✅ COMPLETE (10+ event types)  
**Tests**: ✅ COMPLETE (Comprehensive test suite)  
**Documentation**: ✅ COMPLETE (This guide + API guide)  

**Ready for**: Frontend integration + Production deployment  

---

**Last Updated**: 2024-01-15  
**Version**: 1.0.0  
**Status**: Production Ready
