import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = this.config.getOrThrow<string>('MAIL_FROM');
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.send({
      to,
      subject: 'Verify your email — Food Delivery Platform',
      html: `
        <p>Welcome! Confirm your email address to finish setting up your account.</p>
        <p><a href="${verifyUrl}">Verify email address</a></p>
        <p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your password — Food Delivery Platform',
      html: `
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}">Reset password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can ignore this email —
        your password won't change.</p>
      `,
    });
  }

  private async send(message: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      ...message,
    });
    if (error) {
      this.logger.error(
        `Failed to send email to ${message.to}: ${error.message}`,
      );
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}
