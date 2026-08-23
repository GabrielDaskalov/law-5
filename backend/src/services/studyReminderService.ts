/**
 * Имейл напомняния за учене — връщат студентите в сайта.
 *
 * Логика (без спам):
 *   - Само потребители с email_reminders = true и активен акаунт
 *   - Напомняне при 2+ дни без активност (user_states.updated_at)
 *   - Не по-често от веднъж на 3 дни (last_reminder_at)
 *   - Ако в прогреса има дата на изпит — брои дните до него
 *
 * Отписване: PUT /api/me/preferences { email_reminders: false }
 * (линк за отписване има и в самия имейл)
 */

import nodemailer from 'nodemailer';
import { db } from '../db';
import { config } from '../config';

export class StudyReminderService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.port === 465,
        auth: { user: config.email.user, pass: config.email.password },
      });
    }
    return this.transporter;
  }

  /** Извлича полезни детайли от запазения прогрес (ако ги има) */
  private static extractDetails(state: any): { examDate: Date | null; streakDays: number | null } {
    let examDate: Date | null = null;
    let streakDays: number | null = null;

    try {
      // Дата на изпит — сайтът пази колоквиуми/изпити в state.colloquia [{date,...}] или examDate
      const candidates: any[] = [];
      if (state?.examDate) candidates.push(state.examDate);
      if (Array.isArray(state?.colloquia)) {
        state.colloquia.forEach((c: any) => c?.date && candidates.push(c.date));
      }
      const future = candidates
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()) && d.getTime() > Date.now())
        .sort((a, b) => a.getTime() - b.getTime());
      if (future.length) examDate = future[0];

      if (typeof state?.streakDays === 'number') streakDays = state.streakDays;
    } catch { /* толерантни сме към всякакъв формат */ }

    return { examDate, streakDays };
  }

  private static buildEmail(name: string, daysInactive: number, examDate: Date | null, streakDays: number | null): { subject: string; html: string } {
    const firstName = (name || '').split(' ')[0] || 'колега';

    let examLine = '';
    if (examDate) {
      const daysToExam = Math.ceil((examDate.getTime() - Date.now()) / 86400000);
      examLine = `<p style="font-size:15px;color:#334155;"><strong>⏳ До изпита ти остават ${daysToExam} дни.</strong> Всеки пропуснат ден се брои.</p>`;
    }

    let streakLine = '';
    if (streakDays && streakDays > 1) {
      streakLine = `<p style="font-size:15px;color:#334155;">🔥 Имаше поредица от <strong>${streakDays} дни</strong> учене — жалко е да я загубиш.</p>`;
    }

    const subject = examDate
      ? `⏳ Изпитът наближава — върни се към ученето, ${firstName}`
      : `📚 Материалът те чака, ${firstName} — ${daysInactive} дни пауза`;

    const html = `<!DOCTYPE html>
<html lang="bg"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 0;">
    <table role="presentation" width="560" style="max-width:560px;width:100%;">
      <tr><td style="background:#0F1B2D;border-radius:10px 10px 0 0;padding:20px 32px;">
        <span style="color:#fff;font-size:18px;font-weight:700;">Law<span style="color:#C9A35D;">+</span></span>
      </td></tr>
      <tr><td style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#0F1B2D;">Здравей, ${firstName}!</h1>
        <p style="font-size:15px;color:#334155;">Не си учил от <strong>${daysInactive} дни</strong>. Кратка сесия днес държи материала жив в паметта — дори 15 минути флашкарти правят разлика.</p>
        ${examLine}
        ${streakLine}
        <p style="margin:24px 0;">
          <a href="${process.env.FRONTEND_URL || config.corsOrigin}/#/dashboard"
             style="background:#C9A35D;color:#0F1B2D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Продължи ученето →
          </a>
        </p>
      </td></tr>
      <tr><td style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:16px 32px;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">Получаваш този имейл, защото имаш акаунт в Law+.
        Можеш да изключиш напомнянията от Настройки в сайта.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    return { subject, html };
  }

  /**
   * Изоставена кошница: стигнал до плащане, не завършил.
   * Праща имейл веднъж, при pending покупка на 4+ часа (до 7 дни).
   * Връща броя изпратени.
   */
  static async sendAbandonedCheckoutEmails(): Promise<number> {
    const abandoned = await db.manyOrNone<any>(
      `SELECT pu.id, pu.package_id, pk.name AS package_name, pk.price_eur,
              u.email, u.name
       FROM purchases pu
       JOIN users u ON u.id = pu.user_id
       JOIN packages pk ON pk.id = pu.package_id
       WHERE pu.status = 'pending'
         AND pu.abandoned_email_sent = FALSE
         AND pu.created_at < NOW() - INTERVAL '4 hours'
         AND pu.created_at > NOW() - INTERVAL '7 days'
         AND u.is_active = true
         AND u.email_reminders = true`
    );

    if (!abandoned?.length) return 0;

    if (!config.email.user || !config.email.password) {
      console.warn(`[cart] SMTP не е конфигуриран — ${abandoned.length} имейла пропуснати`);
      return 0;
    }

    let sent = 0;
    for (const a of abandoned) {
      try {
        const firstName = (a.name || '').split(' ')[0] || 'колега';
        const html = `<!DOCTYPE html>
<html lang="bg"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 0;">
    <table role="presentation" width="560" style="max-width:560px;width:100%;">
      <tr><td style="background:#0F1B2D;border-radius:10px 10px 0 0;padding:20px 32px;">
        <span style="color:#fff;font-size:18px;font-weight:700;">Law<span style="color:#C9A35D;">+</span></span>
      </td></tr>
      <tr><td style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#0F1B2D;">Пакетът те чака, ${firstName} 📚</h1>
        <p style="font-size:15px;color:#334155;">Започна покупката на <strong>„${a.package_name}"</strong>
        (${Number(a.price_eur).toFixed(0)} €, lifetime достъп), но плащането не беше завършено.</p>
        <p style="font-size:15px;color:#334155;">Ако е било колебание — напомняме, че можеш първо да пробваш
        5 карти безплатно. Ако е бил технически проблем — просто опитай пак:</p>
        <p style="margin:24px 0;">
          <a href="${process.env.FRONTEND_URL || config.corsOrigin}/#/subject/${a.package_id}"
             style="background:#C9A35D;color:#0F1B2D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Завърши покупката →
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">Няма да получиш второ напомняне за този пакет.
        Напомнянията се изключват от Настройки в сайта.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

        await this.getTransporter().sendMail({
          from: `"Law+" <${config.email.from}>`,
          to: a.email,
          subject: `Пакетът „${a.package_name}" те чака — Law+`,
          html,
        });

        await db.none('UPDATE purchases SET abandoned_email_sent = TRUE WHERE id = $1', [a.id]);
        sent++;
      } catch (err) {
        console.error(`[cart] Грешка при ${a.email}:`, err);
      }
    }

    console.log(`[cart] Изпратени ${sent}/${abandoned.length} имейла за изоставена кошница`);
    return sent;
  }

  /**
   * Обхожда потребителите и праща напомняния на тези, които заслужават.
   * Връща броя изпратени. Безопасно за многократно викане.
   */
  static async sendDueReminders(): Promise<number> {
    // Кандидати: активни, с включени напомняния, не са получавали от 3 дни,
    // и не са учили от 2+ дни (или изобщо нямат запазен прогрес от 2+ дни след регистрация)
    const candidates = await db.manyOrNone<any>(
      `SELECT u.id, u.email, u.name, s.state, s.updated_at AS last_activity
       FROM users u
       LEFT JOIN user_states s ON s.user_id = u.id
       WHERE u.is_active = true
         AND u.email_reminders = true
         AND (u.last_reminder_at IS NULL OR u.last_reminder_at < NOW() - INTERVAL '3 days')
         AND COALESCE(s.updated_at, u.created_at) < NOW() - INTERVAL '2 days'`
    );

    if (!candidates?.length) return 0;

    if (!config.email.user || !config.email.password) {
      console.warn(`[reminders] SMTP не е конфигуриран — ${candidates.length} напомняния пропуснати`);
      return 0;
    }

    let sent = 0;
    for (const u of candidates) {
      try {
        const lastActivity = new Date(u.last_activity || Date.now());
        const daysInactive = Math.max(2, Math.floor((Date.now() - lastActivity.getTime()) / 86400000));
        const { examDate, streakDays } = this.extractDetails(u.state);
        const { subject, html } = this.buildEmail(u.name, daysInactive, examDate, streakDays);

        await this.getTransporter().sendMail({
          from: `"Law+" <${config.email.from}>`,
          to: u.email,
          subject,
          html,
        });

        await db.none('UPDATE users SET last_reminder_at = NOW() WHERE id = $1', [u.id]);
        sent++;
      } catch (err) {
        console.error(`[reminders] Грешка при ${u.email}:`, err);
      }
    }

    console.log(`[reminders] Изпратени ${sent}/${candidates.length} напомняния`);
    return sent;
  }
}
