# Stripe Payment Integration Guide

## Overview

The Pravo Academy backend includes comprehensive Stripe integration for handling:
- One-time payments (course purchases)
- Recurring subscriptions (premium plans)
- Invoice management and payment history
- Webhook event processing
- Refund handling
- Customer payment method management

## Quick Start

### 1. Environment Configuration

Add these variables to your `.env` file:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_test_your_webhook_secret_here

# Payment Settings (optional)
STRIPE_API_VERSION=2023-10-16
```

**Where to find these values:**
1. Go to https://dashboard.stripe.com/apikeys
2. Copy the "Secret key" for `STRIPE_SECRET_KEY`
3. Copy the "Publishable key" for `STRIPE_PUBLISHABLE_KEY`
4. Go to https://dashboard.stripe.com/webhooks and copy your endpoint secret for `STRIPE_WEBHOOK_SECRET`

### 2. Database Setup

Execute the Stripe tables migration:

```bash
psql -U postgres -d pravo_academy -f src/db/migrations/003_create_stripe_tables.sql
```

This creates the following tables:
- `payments` - One-time payment records
- `subscriptions` - Recurring subscription records
- `subscription_products` - Available subscription plans
- `payment_history` - Detailed payment transaction history
- `stripe_webhooks_log` - Webhook processing log
- `customer_payment_methods` - Stored payment methods
- `refunds` - Refund transaction records
- `billing_portal_sessions` - Customer portal access

### 3. Stripe Configuration in Dashboard

#### Create Products and Prices

1. **Go to Products** (https://dashboard.stripe.com/products)
2. **Create a Product** for each subscription tier:
   - Name: "Premium Plan"
   - Description: "Full access to all premium content"

3. **Add Prices** to each product:
   - Monthly: $9.99/month
   - Yearly: $99.99/year

4. **Note the Price IDs** (e.g., `price_1234567890abc`) - you'll need these for API calls

#### Configure Webhook Endpoint

1. **Go to Webhooks** (https://dashboard.stripe.com/webhooks)
2. **Create Endpoint**:
   - URL: `https://your-domain.com/webhooks/stripe`
   - Events: Select all events related to:
     - `charge.succeeded`
     - `charge.failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.created`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `charge.refunded`
     - `customer.created`
     - `customer.updated`
     - `customer.deleted`

3. **Copy the Signing Secret** to your `.env` as `STRIPE_WEBHOOK_SECRET`

### 4. Testing Stripe Locally

Use the Stripe CLI to test webhooks locally:

```bash
# Install Stripe CLI
# On macOS: brew install stripe/stripe-cli/stripe
# On Linux: Follow https://stripe.com/docs/stripe-cli

# Login to your Stripe account
stripe login

# Forward webhook events to local endpoint
stripe listen --forward-to localhost:3000/webhooks/stripe

# Trigger test events
stripe trigger charge.succeeded
stripe trigger customer.subscription.created
```

## API Endpoints

### Payment Endpoints

#### 1. Create Payment Intent
**POST** `/api/payments/create-intent`

Request:
```json
{
  "amount": 99.99,
  "description": "Premium Course Access",
  "metadata": {
    "course_id": "course-123"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "client_secret": "pi_1234567890_secret_abc123",
    "payment_intent_id": "pi_1234567890"
  }
}
```

#### 2. Confirm Payment
**POST** `/api/payments/confirm`

Request:
```json
{
  "payment_intent_id": "pi_1234567890",
  "description": "Premium Course Access"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "payment-uuid",
    "amount": 99.99,
    "status": "completed",
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

#### 3. Get Payment History
**GET** `/api/payments/history?limit=50`

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "payment-uuid",
      "stripe_payment_id": "pi_1234567890",
      "amount": 99.99,
      "status": "completed",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "count": 1
}
```

#### 4. Get Invoices
**GET** `/api/payments/invoices`

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "in_1234567890",
      "amount": 99.99,
      "status": "paid",
      "url": "https://invoice.stripe.com/i/acct_123/inv_123",
      "pdf_url": "https://invoice.stripe.com/i/acct_123/inv_123/pdf",
      "date": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### 5. Request Refund (Admin)
**POST** `/api/payments/{payment_id}/refund`

Request:
```json
{
  "reason": "Customer requested refund",
  "amount": 99.99
}
```

### Subscription Endpoints

#### 1. Create Subscription
**POST** `/api/subscriptions`

Request:
```json
{
  "price_id": "price_1234567890",
  "trial_days": 7,
  "metadata": {
    "plan_tier": "premium"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "subscription-uuid",
    "status": "trialing",
    "current_period_start": "2024-01-15T10:00:00Z",
    "current_period_end": "2024-02-15T10:00:00Z",
    "cancel_at_period_end": false
  }
}
```

#### 2. Get Current Subscription
**GET** `/api/subscriptions/current`

Response:
```json
{
  "success": true,
  "data": {
    "id": "subscription-uuid",
    "status": "active",
    "current_period_start": "2024-01-15T10:00:00Z",
    "current_period_end": "2024-02-15T10:00:00Z",
    "stripe_subscription_id": "sub_1234567890"
  }
}
```

#### 3. Update Subscription (Upgrade/Downgrade)
**PUT** `/api/subscriptions/current`

Request:
```json
{
  "new_price_id": "price_9876543210"
}
```

Response:
```json
{
  "success": true,
  "message": "Subscription updated successfully"
}
```

#### 4. Cancel Subscription
**DELETE** `/api/subscriptions/current?immediately=false`

- `immediately=false` (default): Cancel at end of billing period
- `immediately=true`: Cancel immediately

#### 5. Get Available Products
**GET** `/api/subscriptions/products` (No auth required)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_123",
      "name": "Premium Plan",
      "description": "Full access to premium content",
      "prices": [
        {
          "id": "price_456",
          "amount": 99.99,
          "currency": "usd",
          "interval": "month"
        }
      ]
    }
  ]
}
```

#### 6. Get Subscription Metrics (Admin)
**GET** `/api/subscriptions/metrics`

Response:
```json
{
  "success": true,
  "data": {
    "active_subscriptions": 150,
    "trialing_subscriptions": 25,
    "canceled_subscriptions": 10,
    "monthly_recurring_revenue": 14999.50
  }
}
```

#### 7. Get Payment Stats (Admin)
**GET** `/api/payments/stats?period=month&user_id=uuid`

Response:
```json
{
  "success": true,
  "data": {
    "period": "month",
    "total_payments": 45,
    "total_amount": 4499.55,
    "average_amount": 99.99,
    "completed_count": 43,
    "refunded_count": 2
  }
}
```

## Frontend Integration

### Step 1: Install Stripe.js

```bash
npm install @stripe/react-stripe-js @stripe/stripe-js
```

### Step 2: Setup Stripe Provider

```tsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY);

export function App() {
  return (
    <Elements stripe={stripePromise}>
      <YourApp />
    </Elements>
  );
}
```

### Step 3: Create Payment Component

```tsx
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { useState } from 'react';

export function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);

    // 1. Create payment intent on backend
    const response = await fetch('/api/payments/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 99.99,
        description: 'Premium Course'
      })
    });
    const { data } = await response.json();

    // 2. Confirm payment with Stripe
    const result = await stripe.confirmCardPayment(data.client_secret, {
      payment_method: {
        card: elements.getElement(CardElement),
        billing_details: { name: 'Customer Name' }
      }
    });

    if (result.paymentIntent.status === 'succeeded') {
      // 3. Confirm on backend
      await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_intent_id: result.paymentIntent.id,
          description: 'Premium Course'
        })
      });
      console.log('Payment successful!');
    }

    setLoading(false);
  };

  return (
    <div>
      <CardElement />
      <button onClick={handlePayment} disabled={loading}>
        Pay $99.99
      </button>
    </div>
  );
}
```

### Step 4: Create Subscription Component

```tsx
import { useState } from 'react';

export function SubscriptionForm() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (priceId: string) => {
    setLoading(true);

    const response = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_id: priceId,
        trial_days: 7
      })
    });

    const { data } = await response.json();
    console.log('Subscription created:', data);

    setLoading(false);
  };

  return (
    <div>
      <button onClick={() => handleSubscribe('price_monthly')}>
        Subscribe Monthly
      </button>
      <button onClick={() => handleSubscribe('price_yearly')}>
        Subscribe Yearly
      </button>
    </div>
  );
}
```

## Webhook Processing

The system automatically processes Stripe webhooks at `/webhooks/stripe`.

### Handled Events

1. **charge.succeeded** - Payment succeeded
2. **charge.failed** - Payment failed
3. **customer.subscription.created** - Subscription created
4. **customer.subscription.updated** - Subscription updated
5. **customer.subscription.deleted** - Subscription canceled
6. **invoice.created** - Invoice generated
7. **invoice.paid** - Invoice paid
8. **invoice.payment_failed** - Invoice payment failed
9. **charge.refunded** - Charge refunded

### Webhook Verification

All webhooks are verified using Stripe's signature verification:

```typescript
const event = StripeService.verifyWebhookSignature(
  requestBody,
  signature,
  webhookSecret
);
```

This ensures:
- Only legitimate Stripe events are processed
- No unauthorized requests are accepted
- Events are idempotent (duplicates are skipped)

## Testing

### Unit Tests

Run the Stripe service tests:

```bash
npm test -- stripe.test.ts
```

### Integration Tests

Test the full payment flow:

```bash
# Create payment intent
curl -X POST http://localhost:3000/api/payments/create-intent \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 99.99,
    "description": "Test Payment"
  }'

# Confirm payment
curl -X POST http://localhost:3000/api/payments/confirm \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "pi_xxx",
    "description": "Test Payment"
  }'

# Get payment history
curl -X GET http://localhost:3000/api/payments/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### "STRIPE_SECRET_KEY not configured"
- Check your `.env` file has `STRIPE_SECRET_KEY` set
- Restart the server after adding the key

### Webhook events not processing
- Verify `STRIPE_WEBHOOK_SECRET` is correct
- Check webhook endpoint is publicly accessible
- Review webhook logs in Stripe Dashboard

### Payments failing
- Verify test card numbers: 4242 4242 4242 4242 (success)
- Check expiry date is in future
- Verify CVC is any 3-4 digits

### Test Cards

For Stripe test environment:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Decline (insufficient funds)**: 4000 0000 0000 9995
- **Requires auth**: 4000 0025 0000 3155

## Security Best Practices

1. **Never expose Secret Key**: Keep `STRIPE_SECRET_KEY` in environment variables only
2. **Verify Webhook Signatures**: Always verify incoming webhooks
3. **Use HTTPS**: All payment endpoints must use HTTPS in production
4. **Rate Limiting**: Payment endpoints are rate-limited (see config)
5. **Idempotent Keys**: Consider using idempotency keys for payment operations
6. **PCI Compliance**: Never handle raw card data (use Stripe Elements)

## Monitoring

### Check Webhook Logs

```sql
SELECT * FROM stripe_webhooks_log 
WHERE event_type = 'charge.succeeded' 
ORDER BY created_at DESC 
LIMIT 10;
```

### View Failed Webhooks

```sql
SELECT * FROM stripe_webhooks_log 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

### Payment Statistics

```sql
SELECT 
  COUNT(*) as total_payments,
  SUM(amount) as total_revenue,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
  COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded
FROM payments
WHERE created_at > NOW() - INTERVAL '30 days';
```

## Support & Resources

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe API Reference**: https://stripe.com/docs/api
- **Stripe Testing**: https://stripe.com/docs/testing
- **Stripe CLI**: https://stripe.com/docs/stripe-cli
- **Rate Limits**: https://stripe.com/docs/rate-limits

## Next Steps

1. ✅ Configure Stripe API keys in `.env`
2. ✅ Run database migration
3. ✅ Create Stripe products and prices
4. ✅ Set up webhook endpoint
5. ✅ Test with Stripe CLI
6. ✅ Integrate payment form on frontend
7. ✅ Deploy to production
8. ✅ Monitor webhook processing
