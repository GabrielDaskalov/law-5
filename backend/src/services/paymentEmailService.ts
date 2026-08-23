/**
 * Payment Email Service — имейли за плащания и абонаменти на български.
 * Използва общия EmailService транспорт. Всички имейли са с еднакъв,
 * лек HTML шаблон (без външни картинки — зареждат мигновено).
 */

import nodemailer from 'nodemailer';
import { config } from '../config';

/* ---------- Общ шаблон ---------- */

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#1e3a5f;border-radius:10px 10px 0 0;padding:20px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">⚖️ Law<span style="color:#c9a227;">+</span></span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#ffffff;padding:32px;border:1px solid #e2e8f0;border-top:none;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#1e3a5f;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:16px 32px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            Този имейл е изпратен от Law+. Ако имаш въпроси, отговори на този имейл.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function moneyBGN(amount: number, currency = 'BGN'): string {
  return new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount);
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:14px;color:#64748b;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#1a202c;font-weight:600;text-align:right;">${value}</td>
  </tr>`;
}

/* ---------- Услуга ---------- */

export class PaymentEmailService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.port === 465,
        auth: {
          user: config.email.user,
          pass: config.email.password,
        },
      });
    }
    return this.transporter;
  }

  private static async send(to: string, subject: string, html: string): Promise<void> {
    // Ако имейлът не е конфигуриран — не гърмим, само логваме.
    // Плащането НЕ трябва да се проваля заради имейл проблем.
    if (!config.email.user || !config.email.password) {
      console.warn(`[email] Пропуснат имейл до ${to} („${subject}") — SMTP не е конфигуриран`);
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: `"Law+" <${config.email.from}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      // Имейл грешките никога не спират основния поток
      console.error(`[email] Грешка при изпращане до ${to}:`, error);
    }
  }

  /** Потвърждение на успешно плащане */
  static async sendPaymentConfirmation(
    to: string,
    firstName: string,
    amount: number,
    currency: string,
    description?: string
  ): Promise<void> {
    const html = baseTemplate(
      'Плащането е успешно ✅',
      `<p style="font-size:15px;color:#334155;">Здравей, ${firstName}!</p>
       <p style="font-size:15px;color:#334155;">Благодарим ти — плащането ти беше обработено успешно.</p>
       <table role="presentation" width="100%" style="margin:20px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
         ${infoRow('Сума', moneyBGN(amount, currency))}
         ${infoRow('Описание', description || 'Абонамент Law+')}
         ${infoRow('Дата', new Date().toLocaleDateString('bg-BG'))}
       </table>
       <p style="font-size:15px;color:#334155;">Пълният ти достъп е активен. Успех с ученето! 📚</p>`
    );
    await this.send(to, 'Потвърждение на плащане — Law+', html);
  }

  /** Нов абонамент — добре дошъл */
  static async sendSubscriptionWelcome(
    to: string,
    firstName: string,
    planName: string,
    periodEnd?: Date
  ): Promise<void> {
    const html = baseTemplate(
      'Абонаментът ти е активен 🎉',
      `<p style="font-size:15px;color:#334155;">Здравей, ${firstName}!</p>
       <p style="font-size:15px;color:#334155;">Добре дошъл в Law+! Абонаментът ти е активиран.</p>
       <table role="presentation" width="100%" style="margin:20px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
         ${infoRow('План', planName)}
         ${periodEnd ? infoRow('Следващо подновяване', periodEnd.toLocaleDateString('bg-BG')) : ''}
       </table>
       <p style="font-size:15px;color:#334155;">Вече имаш достъп до всички лекции, конспекти, тестове и казуси.</p>`
    );
    await this.send(to, 'Добре дошъл в Law+! 🎉', html);
  }

  /** Неуспешно плащане — молба за обновяване на картата */
  static async sendPaymentFailed(
    to: string,
    firstName: string,
    amount: number,
    currency: string
  ): Promise<void> {
    const html = baseTemplate(
      'Неуспешно плащане ⚠️',
      `<p style="font-size:15px;color:#334155;">Здравей, ${firstName},</p>
       <p style="font-size:15px;color:#334155;">Опитахме да таксуваме ${moneyBGN(amount, currency)}, но плащането не мина.
       Това обикновено се случва при изтекла карта или недостатъчна наличност.</p>
       <p style="font-size:15px;color:#334155;">Моля, влез в акаунта си и обнови данните за плащане, за да запазиш достъпа си.
       Ще опитаме отново автоматично през следващите дни.</p>`
    );
    await this.send(to, 'Проблем с плащането — Law+', html);
  }

  /** Възстановена сума (refund) */
  static async sendRefundConfirmation(
    to: string,
    firstName: string,
    amount: number,
    currency: string
  ): Promise<void> {
    const html = baseTemplate(
      'Възстановена сума 💳',
      `<p style="font-size:15px;color:#334155;">Здравей, ${firstName},</p>
       <p style="font-size:15px;color:#334155;">Възстановихме ти ${moneyBGN(amount, currency)}.
       Сумата ще се появи по картата ти в рамките на 5–10 работни дни, в зависимост от банката.</p>
       <p style="font-size:15px;color:#334155;">Ако имаш въпроси, просто отговори на този имейл.</p>`
    );
    await this.send(to, 'Възстановена сума — Law+', html);
  }

  /** Абонаментът е спрян */
  static async sendSubscriptionCanceled(
    to: string,
    firstName: string,
    accessUntil?: Date
  ): Promise<void> {
    const html = baseTemplate(
      'Абонаментът е спрян',
      `<p style="font-size:15px;color:#334155;">Здравей, ${firstName},</p>
       <p style="font-size:15px;color:#334155;">Абонаментът ти в Law+ беше спрян.
       ${accessUntil ? `Достъпът ти остава активен до <strong>${accessUntil.toLocaleDateString('bg-BG')}</strong>.` : ''}</p>
       <p style="font-size:15px;color:#334155;">Ще се радваме да те видим отново — можеш да се абонираш пак по всяко време.</p>`
    );
    await this.send(to, 'Абонаментът ти е спрян — Law+', html);
  }
}
