import { JobProcessor } from './base/job-processor';
import { logger } from '../common/utils/logger';
import * as nodemailer from 'nodemailer';

export interface EmailJobData {
  to: string | string[];
  subject: string;
  template: 'invitation' | 'notification' | 'report' | 'reminder' | 'digest';
  data: Record<string, any>;
}

export class EmailProcessor extends JobProcessor {
  private transporter: nodemailer.Transporter;

  constructor(fastify: any) {
    super(fastify, 'email', 5000, 5); // 5 second polling, 5 concurrent
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async processJob(data: EmailJobData): Promise<any> {
    const { to, subject, template, data: templateData } = data;

    // Simple template rendering
    const html = this.renderTemplate(template, templateData);

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@rhythmapp.com',
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    };

    const info = await this.transporter.sendMail(mailOptions);

    logger.info('Email sent', {
      messageId: info.messageId,
      to,
      template,
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
    };
  }

  private renderTemplate(template: string, data: any): string {
    // Simple template rendering - in production use a proper template engine
    switch (template) {
      case 'invitation':
        return `
          <h1>You're invited to join ${data.companyName}!</h1>
          <p>${data.inviterName} has invited you to join their team on Rhythm.</p>
          <a href="${data.inviteLink}">Accept Invitation</a>
        `;
      
      case 'reminder':
        return `
          <h1>Task Reminder</h1>
          <p>Your task "${data.taskTitle}" is due ${data.dueIn}.</p>
          <a href="${data.taskLink}">View Task</a>
        `;
      
      case 'digest':
        return `
          <h1>Your Daily Digest</h1>
          <h2>Today's Schedule</h2>
          <ul>
            ${data.tasks.map((t: any) => `<li>${t.time} - ${t.title}</li>`).join('')}
          </ul>
        `;
      
      default:
        return `<p>${JSON.stringify(data)}</p>`;
    }
  }

  async sendEmail(data: EmailJobData): Promise<string> {
    return this.addJob(data, { priority: 5 });
  }

  async sendBulkEmails(emails: EmailJobData[]): Promise<string[]> {
    return Promise.all(emails.map(email => this.addJob(email)));
  }
}
