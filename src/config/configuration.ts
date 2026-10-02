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
  // Les utilisateurs Laboratoire restent limités au module Laboratoire par défaut.
  // Seule la valeur exacte "true" active l'accès au module Cas clinique.
  laboratoryCanDeclareCases: process.env.LABO_PEUT_DECLARER_CAS === 'true',
});
