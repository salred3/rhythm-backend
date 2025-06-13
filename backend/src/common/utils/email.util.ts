import nodemailer from 'nodemailer';
import { compile } from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import Bull from 'bull';
import { logger } from '../middleware/logging.middleware';
import { CryptoUtil } from './crypto.util';

interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  data?: Record<string, any>;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; content?: Buffer | string; path?: string; contentType?: string }>;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  priority?: 'high' | 'normal' | 'low';
  headers?: Record<string, string>;
}

interface EmailTemplate {
  name: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailUtil {
  private static transporter: nodemailer.Transporter;
  private static emailQueue: Bull.Queue;
  private static templates: Map<string, EmailTemplate> = new Map();
  private static initialized = false;

  static async initialize() {
    if (this.initialized) return;

    if (process.env.NODE_ENV === 'production') {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
    } else {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass }
      });
    }

    try {
      await this.transporter.verify();
      logger.info('Email transporter verified successfully');
    } catch (error) {
      logger.error('Email transporter verification failed', { error });
    }

    this.emailQueue = new Bull('email-queue', {
      redis: { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || '6379'), password: process.env.REDIS_PASSWORD }
    });

    this.emailQueue.process(async job => {
      const { options } = job.data;
      return this.sendImmediate(options);
    });

    this.loadTemplates();
    this.initialized = true;
  }

  private static loadTemplates() {
    const templates: EmailTemplate[] = [
      { name: 'welcome', subject: 'Welcome to Rhythm!', html: this.loadTemplateFile('welcome.hbs') },
      { name: 'password-reset', subject: 'Reset Your Password', html: this.loadTemplateFile('password-reset.hbs') },
      { name: 'invitation', subject: "You've been invited to join {{companyName}}", html: this.loadTemplateFile('invitation.hbs') },
      { name: 'task-reminder', subject: 'Task Reminder: {{taskTitle}}', html: this.loadTemplateFile('task-reminder.hbs') },
      { name: 'subscription-expiring', subject: 'Your subscription is expiring soon', html: this.loadTemplateFile('subscription-expiring.hbs') },
      { name: 'weekly-summary', subject: 'Your Weekly Productivity Summary', html: this.loadTemplateFile('weekly-summary.hbs') }
    ];
    templates.forEach(template => this.templates.set(template.name, template));
  }

  private static loadTemplateFile(filename: string): string {
    try {
      const templatePath = join(__dirname, '../../../templates/emails', filename);
      return readFileSync(templatePath, 'utf-8');
    } catch (error) {
      logger.error(`Failed to load email template: ${filename}`, { error });
      return '';
    }
  }

  static async sendImmediate(options: EmailOptions): Promise<string> {
    if (!this.initialized) { await this.initialize(); }
    try {
      const mailOptions = await this.prepareEmail(options);
      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', { messageId: info.messageId, to: options.to, subject: options.subject });
      if (process.env.NODE_ENV !== 'production') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        logger.info(`Email preview: ${previewUrl}`);
        return previewUrl || info.messageId;
      }
      return info.messageId;
    } catch (error) {
      logger.error('Failed to send email', { error, to: options.to, subject: options.subject });
      throw error;
    }
  }

  static async send(options: EmailOptions, delay?: number): Promise<void> {
    if (!this.initialized) { await this.initialize(); }
    const jobOptions: Bull.JobOptions = {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    };
    if (delay) { jobOptions.delay = delay; }
    if (options.priority) {
      jobOptions.priority = options.priority === 'high' ? 1 : options.priority === 'low' ? 3 : 2;
    }
    await this.emailQueue.add('send-email', { options }, jobOptions);
  }

  private static async prepareEmail(options: EmailOptions): Promise<any> {
    const from = process.env.SMTP_FROM || 'noreply@rhythmapp.com';
    let html = options.html; let text = options.text; let subject = options.subject;
    if (options.template) {
      const template = this.templates.get(options.template);
      if (template) {
        const subjectTemplate = compile(template.subject);
        subject = subjectTemplate(options.data || {});
        const htmlTemplate = compile(template.html);
        html = htmlTemplate({ ...(options.data || {}), year: new Date().getFullYear(), appName: 'Rhythm', appUrl: process.env.APP_URL || 'https://rhythmapp.com' });
        if (!text && template.text) {
          const textTemplate = compile(template.text);
          text = textTemplate(options.data || {});
        }
      }
    }
    if (!text && html) {
      text = this.htmlToText(html);
    }
    if (html && process.env.ENABLE_EMAIL_TRACKING === 'true') {
      const trackingId = await this.generateTrackingId(options.to);
      html += `<img src="${process.env.API_URL}/api/email/track/${trackingId}" width="1" height="1" style="display:none;" />`;
    }
    if (html) {
      const unsubscribeToken = await this.generateUnsubscribeToken(options.to);
      html = html.replace('{{unsubscribe_link}}', `${process.env.APP_URL}/unsubscribe?token=${unsubscribeToken}`);
    }
    return { from, to: options.to, cc: options.cc, bcc: options.bcc, replyTo: options.replyTo, subject, html, text, attachments: options.attachments, headers: { ...(options.headers || {}), 'X-Mailer': 'Rhythm Mailer', 'X-Priority': options.priority === 'high' ? '1' : '3' } };
  }

  private static htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gs, '')
      .replace(/<script[^>]*>.*?<\/script>/gs, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static async generateTrackingId(to: string | string[]): Promise<string> {
    const recipient = Array.isArray(to) ? to[0] : to;
    return CryptoUtil.generateToken(16);
  }

  private static async generateUnsubscribeToken(to: string | string[]): Promise<string> {
    const recipient = Array.isArray(to) ? to[0] : to;
    return CryptoUtil.generateToken(32);
  }

  static async sendBatch(recipients: string[], options: Omit<EmailOptions, 'to'>, batchSize = 50): Promise<void> {
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const delay = i > 0 ? (i / batchSize) * 1000 : 0;
      await this.send({ ...options, to: batch, bcc: batch.length > 1 ? batch : undefined }, delay);
    }
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static async validateEmailDomain(email: string): Promise<boolean> {
    try {
      const domain = email.split('@')[1];
      const dns = require('dns').promises;
      const records = await dns.resolveMx(domain);
      return records && records.length > 0;
    } catch (error) {
      return false;
    }
  }

  static registerTemplate(template: EmailTemplate): void {
    this.templates.set(template.name, template);
  }

  static getTemplate(name: string): EmailTemplate | undefined {
    return this.templates.get(name);
  }

  static async getQueueStatus(): Promise<any> {
    if (!this.emailQueue) { return null; }
    const [waiting, active, completed, failed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getCompletedCount(),
      this.emailQueue.getFailedCount()
    ]);
    return { waiting, active, completed, failed };
  }

  static async retryFailedEmails(): Promise<void> {
    if (!this.emailQueue) { return; }
    const failedJobs = await this.emailQueue.getFailed();
    for (const job of failedJobs) { await job.retry(); }
  }
}

