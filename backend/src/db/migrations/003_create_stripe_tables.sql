/**
 * Stripe Payment & Subscription Tables Migration
 * Creates tables for managing payments, subscriptions, and payment history
 */

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
-- Stores one-time payment records from Stripe
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_id VARCHAR(255) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'completed', -- completed, failed, refunded, disputed
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_id ON payments(stripe_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
-- Stores recurring subscription records
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, trialing, past_due, canceled, unpaid
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at);

-- ============================================================================
-- SUBSCRIPTION_PRODUCTS TABLE
-- ============================================================================
-- Maps subscription products and their features
CREATE TABLE IF NOT EXISTS subscription_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_product_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_price_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  billing_interval VARCHAR(50) NOT NULL, -- monthly, yearly, one-time
  features JSONB, -- JSON array of feature names
  max_users INTEGER, -- NULL for unlimited
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_products_stripe_product ON subscription_products(stripe_product_id);
CREATE INDEX IF NOT EXISTS idx_subscription_products_stripe_price ON subscription_products(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_subscription_products_active ON subscription_products(is_active);

-- ============================================================================
-- PAYMENT_HISTORY TABLE
-- ============================================================================
-- Detailed payment transaction history
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  type VARCHAR(50) NOT NULL, -- payment, refund, chargeback, adjustment
  status VARCHAR(50) NOT NULL, -- succeeded, failed, pending, refunded
  stripe_charge_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_type ON payment_history(type);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at);

-- ============================================================================
-- STRIPE_WEBHOOKS_LOG TABLE
-- ============================================================================
-- Logs for Stripe webhook processing
CREATE TABLE IF NOT EXISTS stripe_webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  status VARCHAR(50) NOT NULL, -- processed, failed, skipped
  error_message TEXT,
  attempt_count INTEGER DEFAULT 1,
  last_attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_log_event_id ON stripe_webhooks_log(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_log_event_type ON stripe_webhooks_log(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_log_status ON stripe_webhooks_log(status);
CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_log_created_at ON stripe_webhooks_log(created_at);

-- ============================================================================
-- CUSTOMER_PAYMENT_METHOD TABLE
-- ============================================================================
-- Stores customer payment methods for recurring payments
CREATE TABLE IF NOT EXISTS customer_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- card, bank_account
  is_default BOOLEAN DEFAULT FALSE,
  last_four VARCHAR(4),
  exp_month INTEGER,
  exp_year INTEGER,
  brand VARCHAR(50), -- visa, mastercard, amex, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_payment_methods_user_id ON customer_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_payment_methods_stripe_id ON customer_payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_customer_payment_methods_default ON customer_payment_methods(is_default);

-- ============================================================================
-- REFUNDS TABLE
-- ============================================================================
-- Tracks refund transactions
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  stripe_refund_id VARCHAR(255) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  reason VARCHAR(50), -- requested_by_customer, duplicate, fraud, other
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, succeeded, failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_stripe_id ON refunds(stripe_refund_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- ============================================================================
-- BILLING_PORTAL_SESSION TABLE
-- ============================================================================
-- Tracks Stripe customer portal sessions for self-service billing
CREATE TABLE IF NOT EXISTS billing_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_customer_id VARCHAR(255) NOT NULL,
  session_url TEXT,
  return_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'created', -- created, active, completed, expired
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_portal_sessions_user_id ON billing_portal_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_portal_sessions_stripe_session_id ON billing_portal_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_billing_portal_sessions_status ON billing_portal_sessions(status);

-- ============================================================================
-- UPDATE users TABLE
-- ============================================================================
-- Add Stripe customer ID and subscription status columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'none'; -- none, active, trialing, past_due, canceled
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_valid_until TIMESTAMP;

-- Create indexes on new user columns
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at on payments
CREATE OR REPLACE FUNCTION update_payments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_update_timestamp ON payments;
CREATE TRIGGER payments_update_timestamp
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_timestamp();

-- Update updated_at on subscriptions
CREATE OR REPLACE FUNCTION update_subscriptions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_update_timestamp ON subscriptions;
CREATE TRIGGER subscriptions_update_timestamp
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_timestamp();

-- Update subscription status in users table when subscription changes
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET subscription_status = NEW.status,
      subscription_valid_until = NEW.current_period_end
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscription_status_sync ON subscriptions;
CREATE TRIGGER subscription_status_sync
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_status();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for active subscriptions with user details
DROP VIEW IF EXISTS active_subscriptions;
CREATE VIEW active_subscriptions AS
SELECT
  s.id,
  s.user_id,
  u.email,
  u.name AS full_name,  -- поправено: колоната е name
  s.status,
  s.current_period_start,
  s.current_period_end,
  s.stripe_subscription_id,
  sp.name as product_name,
  sp.price,
  sp.billing_interval,
  s.created_at
FROM subscriptions s
LEFT JOIN users u ON s.user_id = u.id
LEFT JOIN subscription_products sp ON s.product_id = sp.stripe_product_id
WHERE s.status IN ('active', 'trialing');

-- View for monthly recurring revenue (MRR)
DROP VIEW IF EXISTS monthly_recurring_revenue;
CREATE VIEW monthly_recurring_revenue AS
SELECT
  DATE_TRUNC('month', s.current_period_start) as month,
  COUNT(*) as active_subscriptions,
  COALESCE(SUM(sp.price), 0) as total_mrr,
  AVG(sp.price) as average_price
FROM subscriptions s
LEFT JOIN subscription_products sp ON s.product_id = sp.stripe_product_id
WHERE s.status IN ('active', 'trialing')
  AND s.current_period_end > CURRENT_TIMESTAMP
GROUP BY DATE_TRUNC('month', s.current_period_start);

-- View for payment statistics
DROP VIEW IF EXISTS payment_statistics;
CREATE VIEW payment_statistics AS
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total_payments,
  COUNT(DISTINCT user_id) as unique_customers,
  COALESCE(SUM(amount), 0) as total_revenue,
  AVG(amount) as average_payment,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
  COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments
FROM payments
GROUP BY DATE_TRUNC('month', created_at);
