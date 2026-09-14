import {
  BadGatewayException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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

export interface LabResultMailData {
  to: string;
  medecinName: string;
  casId: number;
  maladie: string;
  statut: string;
}

/**
 * Service d'envoi d'e-mails centralisé basé sur l'API Resend.
 * La clé est lue depuis `RESEND_API_KEY` (jamais hardcodée).
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private from = '';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.error(
        "RESEND_API_KEY non définie : les e-mails ne peuvent pas être envoyés. " +
          'Configurez RESEND_API_KEY dans l’environnement.',
      );
      return;
    }

    this.resend = new Resend(apiKey);

    const fromRaw =
      this.configService.get<string>('MAIL_FROM') ?? 'onboarding@resend.dev';
    // Ex: "ÉpiSuivi <notifications@votredomaine.mg>" — le domaine doit être
    // vérifié dans Resend ; onboarding@resend.dev est le domaine de test dev.
    this.from = fromRaw.includes('<')
      ? fromRaw
      : `ÉpiSuivi <${fromRaw}>`;

    this.logger.log(
      `Service d'e-mails initialisé (Resend) — expéditeur ${this.from}.`,
    );
  }

  async sendWelcomeEmail(data: WelcomeMailData): Promise<void> {
    const subject = 'Bienvenue sur ÉpiSuivi — Activez votre compte';
    await this.send({ to: data.to, subject, html: this.renderWelcomeTemplate(data) });
    this.logger.log(`E-mail de bienvenue envoyé (Resend) pour ${data.to}.`);
  }

  async sendActivationEmail(data: ActivationMailData): Promise<void> {
    const subject = 'Bienvenue sur ÉpiSuivi — Activez votre compte';
    await this.send({ to: data.to, subject, html: this.renderActivationTemplate(data) });
    this.logger.log(`E-mail d'activation envoyé (Resend) pour ${data.to}.`);
  }

  async sendPasswordResetEmail(data: ResetPasswordMailData): Promise<void> {
    const subject = 'Réinitialisation de votre mot de passe ÉpiSuivi';
    await this.send({
      to: data.to,
      subject,
      html: this.renderResetPasswordTemplate(data),
    });
    this.logger.log(
      `E-mail de réinitialisation envoyé (Resend) pour ${data.to}.`,
    );
  }

  async sendLabResultNotification(data: LabResultMailData): Promise<void> {
    const subject = `Résultat du cas #${data.casId} — ÉpiSuivi`;
    await this.send({
      to: data.to,
      subject,
      html: this.renderLabResultTemplate(data),
    });
    this.logger.log(
      `Notification de résultat envoyée (Resend) pour ${data.to} (cas #${data.casId}).`,
    );
  }

  /**
   * Envoie via Resend. En cas d'échec : log de l'erreur brute + exception
   * explicite (les flux critiques ne renvoient pas un succès trompeur).
   */
  private async send(mail: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.resend) {
      throw new BadGatewayException(
        "L'envoi d'e-mails est désactivé : RESEND_API_KEY n'est pas configurée.",
      );
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
      });

      if (error) {
        throw new Error(
          `Resend ${error.name ?? 'error'}: ${error.message ?? String(error)}`,
        );
      }
      if (!data?.id) {
        throw new Error('Resend : réponse sans identifiant d’envoi.');
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Échec de l'envoi Resend vers ${mail.to} (sujet: ${mail.subject}): ${raw}`,
      );
      throw new BadGatewayException(
        `Impossible d'envoyer l'e-mail vers ${mail.to} : le service d'e-mails (Resend) a renvoyé une erreur. Vérifiez la clé API et le domaine de l'expéditeur.`,
      );
    }
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

  private renderLabResultTemplate({
    medecinName,
    casId,
    maladie,
    statut,
  }: LabResultMailData): string {
    const label =
      statut === 'Confirme' ? 'confirmé' : statut === 'Invalide' ? 'invalidé' : statut;
    const color = statut === 'Confirme' ? '#16a34a' : statut === 'Invalide' ? '#dc2626' : '#2563eb';
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #2563eb; margin-top: 0;">Bonjour ${medecinName},</h2>
        <p>Le laboratoire a rendu un résultat pour l'un de vos cas déclarés :</p>
        <p style="text-align:center;">
          <span style="display:inline-block; background:#eff6ff; color:${color}; padding:12px 24px; border-radius:8px; font-size:16px; font-weight:bold;">
            Cas #${casId} · ${maladie} — ${label}
          </span>
        </p>
        <p style="color:#6b7280; font-size: 13px;">Connectez-vous à la plateforme pour consulter le détail du cas et les analyses réalisées.</p>
        <p style="color:#6b7280; font-size: 12px;">Cordialement,<br/>Équipe ÉpiSuivi</p>
      </div>
    `;
  }
}