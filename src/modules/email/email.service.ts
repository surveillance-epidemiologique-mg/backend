import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { lookup } from 'node:dns/promises';

export interface WelcomeMailData {
  to: string;
  name: string;
  tempPassword: string;
  activationLink: string;
}

export interface ActivationMailData {
  to: string;
  name: string;
  activationLink: string;
}

export interface ResetPasswordMailData {
  to: string;
  name: string;
  code: string;
}

type EmailMode = 'smtp' | 'simulation';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private mode: EmailMode = 'simulation';

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const requested = (
      this.configService.get<string>('smtp.mode') ?? ''
    ).toLowerCase();
    const host = this.configService.get<string>('smtp.host');

    // Mode simulation : aucun contact avec un serveur SMTP, affichage en console.
    if (requested === 'simulation' || !host) {
      this.mode = 'simulation';
      this.logger.warn(
        requested === 'smtp'
          ? 'EMAIL_MODE=smtp mais SMTP_HOST est vide : bascule en mode SIMULATION.'
          : 'EMAIL_MODE=simulation : aucun e-mail réel ne sera envoyé. Le contenu des e-mails est affiché dans la console du serveur (développement).',
      );
      return;
    }

    this.mode = 'smtp';
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');
    const port = this.configService.get<number>('smtp.port') ?? 587;
    const secure = this.configService.get<boolean>('smtp.secure') ?? false;

    const resolvedHost = await this.resolveIpv4(host);

    this.transporter = nodemailer.createTransport({
      host: resolvedHost,
      port,
      secure,
      tls: { servername: host },
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    this.logger.log(
      `Transport SMTP initialisé pour ${host} (${resolvedHost}) — EMAIL_MODE=smtp.`,
    );
  }

  async sendWelcomeEmail(data: WelcomeMailData): Promise<void> {
    const subject =
      'Bienvenue sur la plateforme de surveillance épidémiologique';
    const html = this.renderWelcomeTemplate(data);

    await this.dispatch({ to: data.to, subject, html });

    this.logger.log(
      `E-mail de bienvenue ${this.mode === 'smtp' ? 'envoyé' : 'simulé'} pour ${data.to} (mode ${this.mode}).`,
    );
  }

  async sendActivationEmail(data: ActivationMailData): Promise<void> {
    const subject = 'Bienvenue sur ÉpiSuivi — Activez votre compte';
    const html = this.renderActivationTemplate(data);

    await this.dispatch({ to: data.to, subject, html });

    this.logger.log(
      `E-mail d'activation ${this.mode === 'smtp' ? 'envoyé' : 'simulé'} pour ${data.to} (mode ${this.mode}).`,
    );
  }

  async sendPasswordResetEmail(data: ResetPasswordMailData): Promise<void> {
    const subject = 'Réinitialisation de votre mot de passe ÉpiSuivi';
    const html = this.renderResetPasswordTemplate(data);

    await this.dispatch({ to: data.to, subject, html });

    this.logger.log(
      `E-mail de réinitialisation ${this.mode === 'smtp' ? 'envoyé' : 'simulé'} pour ${data.to} (mode ${this.mode}).`,
    );
  }

  private renderActivationTemplate({
    name,
    activationLink,
  }: ActivationMailData): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">Bonjour ${name},</h2>
        <p>Votre compte <strong>ÉpiSuivi</strong> a été créé.</p>
        <p>Pour accéder à la plateforme, veuillez activer votre compte et créer votre mot de passe en cliquant sur le bouton ci-dessous.</p>
        <p style="text-align:center;">
          <a href="${activationLink}" style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">
            Activer mon compte
          </a>
        </p>
        <p style="color:#6b7280; font-size: 13px;">Ce lien est temporaire et sécurisé. Il expire sous 24 heures et ne peut être utilisé qu'une seule fois.</p>
        <p style="color:#6b7280; font-size: 13px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : <br/>${activationLink}</p>
        <p style="color:#6b7280; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet e-mail.</p>
        <p style="color:#6b7280; font-size: 12px;">Cordialement,<br/>Équipe ÉpiSuivi</p>
      </div>
    `;
  }

  private renderResetPasswordTemplate({
    name,
    code,
  }: ResetPasswordMailData): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">Bonjour ${name},</h2>
        <p>Vous avez demandé la réinitialisation de votre mot de passe <strong>ÉpiSuivi</strong>.</p>
        <p>Utilisez le code de vérification ci-dessous pour définir un nouveau mot de passe :</p>
        <p style="text-align:center;">
          <code style="display:inline-block; background:#eff6ff; color:#1d4ed8; padding:16px 32px; border-radius:8px; font-size:28px; letter-spacing:6px; font-weight:bold;">${code}</code>
        </p>
        <p style="color:#6b7280; font-size: 13px;">Ce code expire dans 10 minutes et ne peut être utilisé qu'une seule fois.</p>
        <p style="color:#6b7280; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet e-mail.</p>
        <p style="color:#6b7280; font-size: 12px;">Cordialement,<br/>Équipe ÉpiSuivi</p>
      </div>
    `;
  }

  private renderWelcomeTemplate({
    to,
    name,
    tempPassword,
    activationLink,
  }: WelcomeMailData): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #0f766e; margin-top: 0;">Bienvenue, ${name}</h2>
        <p>Votre compte a été créé sur la plateforme de surveillance épidémiologique de Madagascar.</p>
        <p>Voici vos identifiants de connexion :</p>
        <ul>
          <li><strong>Adresse e-mail :</strong> ${to}</li>
          <li><strong>Mot de passe temporaire :</strong> <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${tempPassword}</code></li>
        </ul>
        <p>Pour activer votre compte et définir votre mot de passe personnel, cliquez sur le bouton ci-dessous :</p>
        <p style="text-align:center;">
          <a href="${activationLink}" style="display:inline-block; background:#0f766e; color:#ffffff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">
            Activer mon compte
          </a>
        </p>
        <p style="color:#6b7280; font-size: 13px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : <br/>${activationLink}</p>
        <p style="color:#6b7280; font-size: 12px;">Ce lien d'activation est à usage unique et expire après utilisation. Merci de ne pas répondre à cet e-mail.</p>
      </div>
    `;
  }

  /**
   * Envoie un e-mail.
   * - Mode SMTP : envoi réel ; en cas d'échec, une erreur est levée (l'appelant
   *   sait que l'e-mail n'a PAS été envoyé — jamais de faux « envoyé »).
   * - Mode simulation : aucun contact SMTP, le contenu est affiché dans la console.
   */
  private async dispatch(mail: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (this.mode === 'smtp' && this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.buildFromAddress(),
          ...mail,
        });
        return;
      } catch (error) {
        this.logger.error(
          `Échec de l'envoi SMTP vers ${mail.to}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw new Error(`Échec de l'envoi de l'e-mail (SMTP) vers ${mail.to}.`);
      }
    }

    this.logger.warn(
      `[SIMULATION EMAIL] À: ${mail.to}\nSujet: ${mail.subject}\nContenu:\n${mail.html}`,
    );
  }

  private buildFromAddress(): string {
    const fromName = this.configService.get<string>('smtp.fromName');
    const from =
      this.configService.get<string>('smtp.from') ?? 'no-reply@surveillance.mg';
    return fromName ? `"${fromName}" <${from}>` : from;
  }

  private async resolveIpv4(host: string): Promise<string> {
    try {
      const { address } = await lookup(host, { family: 4 });
      return address;
    } catch {
      this.logger.warn(
        `Résolution IPv4 échouée pour ${host}, utilisation du nom d'hôte d'origine.`,
      );
      return host;
    }
  }
}
