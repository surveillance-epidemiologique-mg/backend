import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedRoles } from "./seeders/role.seeder";
import { seedMaladies } from "./seeders/maladie.seeder";
import { seedZonesAdministratives } from "./seeders/zone-administrative.seeder";
import { seedCentresSante } from "./seeders/centre-sante.seeder";
import { seedUtilisateurs } from "./seeders/utilisateur.seeder";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL n'est pas définie dans l'environnement.");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedRoles(prisma);
    await seedMaladies(prisma);
    await seedZonesAdministratives(prisma);
    await seedCentresSante(prisma);
    await seedUtilisateurs(prisma);

    console.log("Seeding terminé avec succès.");
  } catch (error) {
    console.error("Échec du seeding:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
