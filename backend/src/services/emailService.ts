/**
 * Email Service - Handles all email communications
 */

import nodemailer from 'nodemailer';
import { config } from '../config';

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize email transporter
   */
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

  /**
   * Send password reset email
   */
  static async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping password reset email');
      return;
    }

    // Линкът сочи към САЙТА (FRONTEND_URL), не към API-то
    const frontendUrl = process.env.FRONTEND_URL || config.corsOrigin;
    const resetLink = `${frontendUrl}/#/reset-password?token=${resetToken}`;

    const htmlContent = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#0F1B2D;border-radius:10px 10px 0 0;padding:20px 32px;">
          <span style="color:#fff;font-size:18px;font-weight:700;">Law<span style="color:#C9A35D;">+</span></span>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#0F1B2D;">Нова парола</h1>
          <p style="font-size:15px;color:#334155;">Поискана е смяна на паролата за акаунта ти в Law+.
          Натисни бутона, за да зададеш нова парола:</p>
          <p style="margin:24px 0;">
            <a href="${resetLink}" style="background:#C9A35D;color:#0F1B2D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Задай нова парола →</a>
          </p>
          <p style="font-size:13px;color:#64748b;">Линкът е валиден 1 час. Ако не си искал смяна на паролата — игнорирай този имейл, нищо няма да се промени.</p>
        </div>
      </div>
    `;

    await this.sendEmail(
      email,
      'Нова парола — Law+',
      htmlContent,
      `Линк за нова парола: ${resetLink}`
    );
  }

  /**
   * Send welcome email
   */
  static async sendWelcomeEmail(email: string, name: string): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping welcome email');
      return;
    }

    const htmlContent = `
      <h2>Welcome to Pravo Academy!</h2>
      <p>Hi ${name},</p>
      <p>Thank you for registering with us. We're excited to help you prepare for your legal studies.</p>
      <p>Get started by:</p>
      <ul>
        <li>Exploring our subjects and topics</li>
        <li>Studying flashcards</li>
        <li>Taking quizzes to test your knowledge</li>
        <li>Reading legal cases and conspects</li>
      </ul>
      <p>Good luck with your studies!</p>
    `;

    await this.sendEmail(email, 'Welcome to Pravo Academy', htmlContent, 'Welcome to Pravo Academy!');
  }

  /**
   * Send quiz reminder email
   */
  static async sendQuizReminderEmail(email: string, quizTitle: string): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping quiz reminder');
      return;
    }

    const htmlContent = `
      <h2>Quiz Reminder</h2>
      <p>You have a quiz coming up: <strong>${quizTitle}</strong></p>
      <p>Don't forget to test your knowledge and track your progress!</p>
      <p>Log in to Pravo Academy to start the quiz.</p>
    `;

    await this.sendEmail(email, `Quiz Reminder: ${quizTitle}`, htmlContent, `Quiz reminder: ${quizTitle}`);
  }

  /**
   * Send exam countdown email
   */
  static async sendExamCountdownEmail(
    email: string,
    subjectTitle: string,
    daysRemaining: number
  ): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping exam countdown');
      return;
    }

    const htmlContent = `
      <h2>Exam Countdown</h2>
      <p>Your ${subjectTitle} exam is coming up in <strong>${daysRemaining} day(s)</strong>!</p>
      <p>Make sure you're prepared by:</p>
      <ul>
        <li>Reviewing key concepts with flashcards</li>
        <li>Taking practice quizzes</li>
        <li>Studying legal cases</li>
      </ul>
      <p>You've got this!</p>
    `;

    await this.sendEmail(
      email,
      `${subjectTitle} Exam in ${daysRemaining} Days`,
      htmlContent,
      `Exam countdown: ${subjectTitle} in ${daysRemaining} days`
    );
  }

  /**
   * Send achievement email
   */
  static async sendAchievementEmail(email: string, achievementName: string, description: string): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping achievement email');
      return;
    }

    const htmlContent = `
      <h2>🎉 Achievement Unlocked!</h2>
      <p>Congratulations! You've earned the <strong>${achievementName}</strong> achievement!</p>
      <p>${description}</p>
      <p>Keep up the great work!</p>
    `;

    await this.sendEmail(email, `Achievement: ${achievementName}`, htmlContent, `Achievement unlocked: ${achievementName}`);
  }

  /**
   * Send weekly progress report email
   */
  static async sendWeeklyReportEmail(
    email: string,
    userName: string,
    stats: {
      flashcards_completed: number;
      quizzes_taken: number;
      average_score: number;
      current_streak: number;
    }
  ): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping weekly report');
      return;
    }

    const htmlContent = `
      <h2>Your Weekly Progress Report</h2>
      <p>Hi ${userName},</p>
      <p>Here's how you're doing this week:</p>
      <ul>
        <li><strong>Flashcards Completed:</strong> ${stats.flashcards_completed}</li>
        <li><strong>Quizzes Taken:</strong> ${stats.quizzes_taken}</li>
        <li><strong>Average Score:</strong> ${stats.average_score}%</li>
        <li><strong>Current Streak:</strong> ${stats.current_streak} days</li>
      </ul>
      <p>Keep up the momentum!</p>
    `;

    await this.sendEmail(
      email,
      'Your Weekly Progress Report',
      htmlContent,
      'Your weekly progress report is ready'
    );
  }

  /* ======================================================================
     УСТРОЙСТВА

     Двата имейла отдолу правят едно и също нещо от две страни: казват на
     човека, че в акаунта му е влязло ново устройство. Първият само уведомява,
     вторият иска потвърждение, защото устройството е над месечния лимит.

     И двата са полезни двойно: пазят жертвата на открадната парола и
     напомнят на този, който е споделил достъпа си, че се брои. Второто
     работи по-добре от първото.
     ====================================================================== */

  /** Уведомление: влязло е ново устройство, всичко е наред, но да се знае. */
  static async sendVhodOtNovoUstrojstvo(
    email: string,
    ustrojstvo: string,
    ip?: string
  ): Promise<void> {
    if (!config.email.user || !config.email.password) {
      console.warn(`[email] не е настроен — пропускам известието за ново устройство (${email})`);
      return;
    }

    const kogato = new Date().toLocaleString('bg-BG', { dateStyle: 'long', timeStyle: 'short' });
    const frontendUrl = process.env.FRONTEND_URL || config.corsOrigin;

    const html = `
      ${this.shapka()}
        <h1 style="margin:0 0 16px;font-size:20px;color:#0F1B2D;">Влезе ново устройство</h1>
        <p style="font-size:15px;color:#334155;line-height:1.6;">В акаунта ти в Law+ току-що влезе устройство, което не сме виждали досега.</p>
        <table style="width:100%;font-size:14px;color:#334155;border-collapse:collapse;margin:18px 0;">
          <tr><td style="padding:6px 0;color:#64748b;width:110px;">Устройство</td><td style="padding:6px 0;">${this.bezopasno(ustrojstvo)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Кога</td><td style="padding:6px 0;">${kogato}</td></tr>
          ${ip ? `<tr><td style="padding:6px 0;color:#64748b;">Мрежа</td><td style="padding:6px 0;">${this.bezopasno(ip)}</td></tr>` : ''}
        </table>
        <p style="font-size:15px;color:#334155;line-height:1.6;"><strong>Ти ли беше?</strong> Тогава няма какво да правиш.</p>
        <p style="font-size:15px;color:#334155;line-height:1.6;">Ако не си бил ти — смени паролата си. Това изхвърля всички други устройства веднага.</p>
        <p style="margin:24px 0;">
          <a href="${frontendUrl}/#/settings" style="background:#C9A35D;color:#0F1B2D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Виж устройствата си →</a>
        </p>
        <p style="font-size:13px;color:#64748b;">Достъпът до Law+ е личен. Един акаунт работи на едно устройство в даден момент.</p>
      ${this.podval()}
    `;

    await this.sendEmail(
      email,
      'Влезе ново устройство — Law+',
      html,
      `В акаунта ти влезе ново устройство: ${ustrojstvo}, ${kogato}${ip ? ', мрежа ' + ip : ''}. Ако не си бил ти, смени паролата си.`
    );
  }

  /** Искане за потвърждение: устройството е над месечния лимит. */
  static async sendNovoUstrojstvoZaPotvarzhdenie(
    email: string,
    kod: string,
    ustrojstvo: string,
    ip?: string
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || config.corsOrigin;
    const link = `${frontendUrl}/#/potvardi-ustrojstvo?kod=${kod}`;

    if (!config.email.user || !config.email.password) {
      // Без настроена поща човекът би останал навън без никакъв изход.
      // Затова линкът отива в дневника — при локална разработка се копира
      // оттам. На живо това никога не се случва, защото пощата е настроена.
      console.warn(
        `\n[email] НЕ Е НАСТРОЕН. Линк за потвърждение на устройство (${email}):\n  ${link}\n`
      );
      return;
    }

    const kogato = new Date().toLocaleString('bg-BG', { dateStyle: 'long', timeStyle: 'short' });

    const html = `
      ${this.shapka()}
        <h1 style="margin:0 0 16px;font-size:20px;color:#0F1B2D;">Ново устройство — потвърди, че си ти</h1>
        <p style="font-size:15px;color:#334155;line-height:1.6;">Някой влиза в акаунта ти от устройство, което не сме виждали, а акаунтът вече е ползван от повече устройства, отколкото е обичайно за един човек.</p>
        <table style="width:100%;font-size:14px;color:#334155;border-collapse:collapse;margin:18px 0;">
          <tr><td style="padding:6px 0;color:#64748b;width:110px;">Устройство</td><td style="padding:6px 0;">${this.bezopasno(ustrojstvo)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Кога</td><td style="padding:6px 0;">${kogato}</td></tr>
          ${ip ? `<tr><td style="padding:6px 0;color:#64748b;">Мрежа</td><td style="padding:6px 0;">${this.bezopasno(ip)}</td></tr>` : ''}
        </table>
        <p style="margin:24px 0;">
          <a href="${link}" style="background:#C9A35D;color:#0F1B2D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Да, това е моето устройство →</a>
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;"><strong>Не си ти?</strong> Не отваряй линка и смени паролата си — някой знае паролата ти.</p>
        <p style="font-size:13px;color:#64748b;">Линкът важи 24 часа. Достъпът до Law+ е личен и не се преотстъпва.</p>
      ${this.podval()}
    `;

    await this.sendEmail(
      email,
      'Потвърди новото устройство — Law+',
      html,
      `Ново устройство в акаунта ти (${ustrojstvo}, ${kogato}). Потвърди го: ${link}`
    );
  }

  /** Общата шапка на писмата — за да не се преписва във всяко. */
  private static shapka(): string {
    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#0F1B2D;border-radius:10px 10px 0 0;padding:20px 32px;">
          <span style="color:#fff;font-size:18px;font-weight:700;">Law<span style="color:#C9A35D;">+</span></span>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;">`;
  }

  private static podval(): string {
    return `</div></div>`;
  }

  /** Всичко, което идва отвън, минава оттук, преди да влезе в HTML на писмото. */
  private static bezopasno(v: string): string {
    return String(v || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }

  /**
   * Generic email sending method
   */
  // public: ползва се и от notificationSchedulerService
  static async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    textContent: string
  ): Promise<void> {
    try {
      const transporter = this.getTransporter();

      await transporter.sendMail({
        from: config.email.from,
        to,
        subject,
        html: htmlContent,
        text: textContent,
      });

      console.log(`✓ Email sent to ${to}: ${subject}`);
    } catch (error) {
      console.error(`✗ Failed to send email to ${to}:`, error);
      // Don't throw - email failures shouldn't break the app
    }
  }

  /**
   * Verify SMTP connection
   */
  static async verifyConnection(): Promise<boolean> {
    if (!config.email.user || !config.email.password) {
      console.warn('Email not configured - skipping verification');
      return false;
    }

    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      console.log('✓ Email service connected successfully');
      return true;
    } catch (error) {
      console.error('✗ Email service connection failed:', error);
      return false;
    }
  }
}
