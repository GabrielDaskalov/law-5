/**
 * Webhook Service - Real-time event notifications for integrations
 * Manages webhook subscriptions and event delivery
 */

import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../types';

export interface Webhook {
  id: string;
  admin_id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  created_at: Date;
  last_triggered_at?: Date;
  failure_count: number;
}

export interface WebhookEvent {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, any>;
  status: 'pending' | 'delivered' | 'failed';
  error_message?: string;
  created_at: Date;
}

export class WebhookService {
  /**
   * Create webhook subscription
   */
  static async createWebhook(
    adminId: string,
    name: string,
    url: string,
    events: string[]
  ): Promise<Webhook> {
    const id = uuidv4();
    const secret = uuidv4();

    await db.none(
      `INSERT INTO webhooks (id, admin_id, name, url, events, secret)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, adminId, name, url, JSON.stringify(events), secret]
    );

    return {
      id,
      admin_id: adminId,
      name,
      url,
      events,
      active: true,
      secret,
      created_at: new Date(),
      failure_count: 0,
    };
  }

  /**
   * Get all webhooks for admin
   */
  static async getWebhooks(adminId: string): Promise<Webhook[]> {
    const webhooks = await db.manyOrNone<any>(
      `SELECT * FROM webhooks WHERE admin_id = $1 ORDER BY created_at DESC`,
      [adminId]
    );

    return webhooks.map((w: any) => ({
      ...w,
      events: Array.isArray(w.events) ? w.events : JSON.parse(w.events),
    }));
  }

  /**
   * ПОПРАВКА (IDOR): webhook-ите са per-admin — `getWebhooks` филтрира по
   * `admin_id`. Операциите по `id` обаче проверяваха само ролята, тоест всеки
   * админ можеше да пипа чуждите. Най-тежко при UPDATE: чужд webhook се
   * пренасочва към сървър на нападателя и всички бъдещи събития заминават там.
   *
   * Отказът е 404, а не 403 — чужд идентификатор не бива да се потвърждава.
   */
  private static async assertOwnership(webhookId: string, adminId: string): Promise<void> {
    const webhook = await db.oneOrNone<{ id: string }>(
      'SELECT id FROM webhooks WHERE id = $1 AND admin_id = $2',
      [webhookId, adminId]
    );

    if (!webhook) throw new NotFoundError('Webhook-ът не е намерен');
  }

  /**
   * Update webhook
   */
  static async updateWebhook(
    webhookId: string,
    adminId: string,
    name?: string,
    url?: string,
    events?: string[],
    active?: boolean
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }

    if (url !== undefined) {
      updates.push(`url = $${paramCount}`);
      params.push(url);
      paramCount++;
    }

    if (events !== undefined) {
      updates.push(`events = $${paramCount}`);
      params.push(JSON.stringify(events));
      paramCount++;
    }

    if (active !== undefined) {
      updates.push(`active = $${paramCount}`);
      params.push(active);
      paramCount++;
    }

    if (updates.length === 0) {
      // Празно тяло не променя нищо, но собствеността пак се проверява —
      // иначе отговорът „обновен“ издава кои чужди id-та съществуват.
      await this.assertOwnership(webhookId, adminId);
      return;
    }

    params.push(webhookId, adminId);
    const result = await db.result(
      `UPDATE webhooks SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND admin_id = $${paramCount + 1}`,
      params
    );

    if (result.rowCount === 0) throw new NotFoundError('Webhook-ът не е намерен');
  }

  /**
   * Delete webhook
   */
  static async deleteWebhook(webhookId: string, adminId: string): Promise<void> {
    const result = await db.result('DELETE FROM webhooks WHERE id = $1 AND admin_id = $2', [
      webhookId,
      adminId,
    ]);

    if (result.rowCount === 0) throw new NotFoundError('Webhook-ът не е намерен');
  }

  /**
   * Trigger webhook event
   */
  static async triggerEvent(
    eventType: string,
    payload: Record<string, any>,
    adminId?: string
  ): Promise<void> {
    try {
      // Get all active webhooks that subscribe to this event
      let query = `SELECT * FROM webhooks WHERE active = true AND events::text LIKE $1`;
      const params = [`%${eventType}%`];

      if (adminId) {
        query += ` AND admin_id = $${params.length + 1}`;
        params.push(adminId);
      }

      const webhooks = await db.manyOrNone<any>(query, params);

      for (const webhook of webhooks) {
        // Queue event for delivery
        await this.queueWebhookEvent(webhook.id, eventType, payload);
      }
    } catch (error) {
      console.error('Error triggering webhooks:', error);
    }
  }

  /**
   * Queue webhook event for delivery
   */
  private static async queueWebhookEvent(
    webhookId: string,
    eventType: string,
    payload: Record<string, any>
  ): Promise<void> {
    const eventId = uuidv4();

    await db.none(
      `INSERT INTO webhook_events (id, webhook_id, event_type, payload, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [eventId, webhookId, eventType, JSON.stringify(payload)]
    );

    // Attempt immediate delivery
    await this.deliverEvent(eventId, webhookId, payload);
  }

  /**
   * Deliver webhook event
   */
  private static async deliverEvent(
    eventId: string,
    webhookId: string,
    payload: Record<string, any>
  ): Promise<void> {
    try {
      const webhook = await db.one<any>(
        'SELECT * FROM webhooks WHERE id = $1',
        [webhookId]
      );

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': payload.event_type || 'unknown',
          'X-Webhook-ID': webhookId,
          'X-Webhook-Timestamp': new Date().toISOString(),
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await db.none(
          `UPDATE webhook_events SET status = 'delivered' WHERE id = $1`,
          [eventId]
        );

        // Reset failure count
        await db.none(
          `UPDATE webhooks SET failure_count = 0, last_triggered_at = NOW() WHERE id = $1`,
          [webhookId]
        );
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      // Mark as failed and increment failure count
      await db.none(
        `UPDATE webhook_events SET status = 'failed', error_message = $1 WHERE id = $2`,
        [error.message, eventId]
      );

      const failureCount = await db.one<any>(
        'SELECT failure_count FROM webhooks WHERE id = $1',
        [webhookId]
      );

      const newCount = parseInt(failureCount.failure_count) + 1;

      // Disable webhook after 10 failures
      const shouldDisable = newCount > 10;

      await db.none(
        `UPDATE webhooks SET failure_count = $1, active = $2 WHERE id = $3`,
        [newCount, !shouldDisable, webhookId]
      );
    }
  }

  /**
   * Retry failed events
   */
  static async retryFailedEvents(): Promise<number> {
    const failedEvents = await db.manyOrNone<any>(
      `SELECT we.id, we.webhook_id, we.payload
       FROM webhook_events we
       WHERE we.status = 'failed' AND we.created_at > NOW() - INTERVAL '24 hours'
       LIMIT 100`
    );

    let retryCount = 0;

    for (const event of failedEvents) {
      try {
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        await this.deliverEvent(event.id, event.webhook_id, payload);
        retryCount++;
      } catch (error) {
        console.error(`Failed to retry webhook event ${event.id}:`, error);
      }
    }

    return retryCount;
  }

  /**
   * Get webhook delivery history
   */
  static async getWebhookHistory(
    webhookId: string,
    adminId: string,
    limit: number = 50
  ): Promise<WebhookEvent[]> {
    // Собствеността се проверява отделно: празна история е нормален резултат
    // за собствен webhook, така че по броя редове не може да се различи
    // „чужд webhook“ от „още няма събития“.
    await this.assertOwnership(webhookId, adminId);

    const events = await db.manyOrNone<any>(
      `SELECT e.*
         FROM webhook_events e
         JOIN webhooks w ON w.id = e.webhook_id
        WHERE e.webhook_id = $1 AND w.admin_id = $2
        ORDER BY e.created_at DESC LIMIT $3`,
      [webhookId, adminId, limit]
    );

    return events.map((e: any) => ({
      ...e,
      payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
    }));
  }

  /**
   * Get webhook statistics
   */
  static async getWebhookStats(webhookId: string, adminId: string): Promise<any> {
    // Агрегатът винаги връща един ред (нули за несъществуващ webhook), затова
    // собствеността не може да се изведе от резултата и се проверява отделно.
    await this.assertOwnership(webhookId, adminId);

    const stats = await db.one<any>(
      `SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN e.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN e.status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN e.status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM webhook_events e
       JOIN webhooks w ON w.id = e.webhook_id
       WHERE e.webhook_id = $1 AND w.admin_id = $2`,
      [webhookId, adminId]
    );

    return {
      total_events: parseInt(stats.total_events),
      delivered: parseInt(stats.delivered),
      failed: parseInt(stats.failed),
      pending: parseInt(stats.pending),
      success_rate: stats.total_events > 0 ? Math.round((parseInt(stats.delivered) / parseInt(stats.total_events)) * 100) : 0,
    };
  }

  /**
   * Test webhook
   */
  static async testWebhook(webhookId: string, adminId: string): Promise<boolean> {
    // Извън try-а: отказът за чужд webhook трябва да излезе като 404, а не да
    // бъде погълнат от catch-а и върнат като „тестът се провали“.
    const webhook = await db.oneOrNone<any>(
      'SELECT * FROM webhooks WHERE id = $1 AND admin_id = $2',
      [webhookId, adminId]
    );

    if (!webhook) throw new NotFoundError('Webhook-ът не е намерен');

    try {
      const testPayload = {
        event_type: 'test',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test webhook' },
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'test',
          'X-Webhook-ID': webhookId,
        },
        body: JSON.stringify(testPayload),
      });

      return response.ok;
    } catch (error) {
      console.error('Webhook test failed:', error);
      return false;
    }
  }
}
