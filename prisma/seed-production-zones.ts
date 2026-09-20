import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { seedProductionZones } from './seeders/production-zones.seeder';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL est requise.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await prisma.$transaction(seedProductionZones, {
      maxWait: 10000,
      timeout: 180000,
    });
    console.log(
      'Zones de production : 22 régions et leurs géométries importées.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Échec du seed des zones de production :', error);
  process.exitCode = 1;
});
