import * as bcrypt from 'bcryptjs';
import { Prisma } from '../../generated/prisma/client';
import { DEMO_CENTRE_NAMES } from './centre-sante.seeder';

const ADMIN_NAME = process.env.ADMIN_NAME;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);

export async function seedUtilisateurs(prisma: Prisma.TransactionClient) {
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Variables ADMIN_NAME, ADMIN_EMAIL et ADMIN_PASSWORD manquantes dans le fichier .env',
    );
  }

  const adminRole = await prisma.role.findUnique({
    where: { name: 'Administrateur' },
  });

  if (!adminRole) {
    throw new Error(
      "Role 'Administrateur' introuvable. Exécutez d'abord seedRoles.",
    );
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await prisma.utilisateur.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      name: ADMIN_NAME,
      passwordHash,
      roleId: adminRole.id,
      temporaryPassword: false,
    },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      roleId: adminRole.id,
      temporaryPassword: false,
    },
  });

  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword)
    throw new Error(
      'DEMO_PASSWORD est requis pour les comptes de démonstration.',
    );
  const demoHash = await bcrypt.hash(demoPassword, BCRYPT_ROUNDS);
  const medecinRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Medecin' },
  });
  const laboRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'Laboratoire' },
  });
  const centres = await prisma.centreSante.findMany({
    where: { name: { in: DEMO_CENTRE_NAMES }, sourceId: null },
    orderBy: { name: 'asc' },
  });
  for (const centre of centres) {
    const data = {
      name: `Médecin démo — ${centre.name}`,
      passwordHash: demoHash,
      roleId: medecinRole.id,
      centreId: centre.id,
      isActive: true,
      temporaryPassword: false,
    };
    await prisma.utilisateur.upsert({
      where: { email: demoMedecinEmail(centre.name) },
      create: { ...data, email: demoMedecinEmail(centre.name) },
      update: data,
    });
  }
  for (const index of [1, 2, 3]) {
    const email = `labo${index}@demo.surveillance.test`;
    const data = {
      name: `Agent laboratoire démo ${index}`,
      passwordHash: demoHash,
      roleId: laboRole.id,
      centreId: null,
      isActive: true,
      temporaryPassword: false,
    };
    await prisma.utilisateur.upsert({
      where: { email },
      create: { ...data, email },
      update: data,
    });
  }
}

export function demoMedecinEmail(centreName: string): string {
  const slug = centreName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return `medecin.${slug}@demo.surveillance.test`;
}
