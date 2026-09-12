export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '86400', 10),
    rememberMeExpiresIn: parseInt(
      process.env.JWT_REMEMBER_ME_EXPIRES_IN ?? '2592000',
      10,
    ),
    cookieName: process.env.JWT_COOKIE_NAME ?? 'access_token',
  },
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  smtp: {
    mode:
      process.env.EMAIL_MODE ?? (process.env.SMTP_HOST ? 'smtp' : 'simulation'),
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    // Version IP pour la connexion SMTP : 4 (IPv4), 6 (IPv6), 0 (auto).
    // Par défaut 4 : évite l'échec ENETUNREACH quand le serveur n'a pas de
    // route IPv6 (ex: Gmail résolu en AAAA mais IPv6 indisponible).
    family: parseInt(process.env.SMTP_FAMILY ?? '4', 10),
    from: process.env.MAIL_FROM ?? 'no-reply@surveillance.mg',
    fromName:
      process.env.MAIL_FROM_NAME ?? 'Surveillance Epidemiologique Madagascar',
  },
});
