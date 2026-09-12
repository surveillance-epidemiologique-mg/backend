import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL n'est pas définie dans l'environnement.");
    }

    // Analyse de l'URL pour gérer le SSL correctement et éviter le warning de pg-connection-string
    const url = new URL(databaseUrl);
    const sslMode = url.searchParams.get('sslmode');
    
    let ssl: boolean | { rejectUnauthorized: boolean } = false;
    
    if (sslMode) {
      if (['require', 'prefer', 'verify-ca', 'verify-full'].includes(sslMode)) {
        // Neon et la plupart des services cloud modernes recommandent 'require'.
        // En passant ssl: true au Pool, on active SSL de manière sécurisée sans déclencher le warning.
        ssl = true;
      }
      // On retire sslmode de l'URL pour ne pas déclencher le warning du parser
      url.searchParams.delete('sslmode');
    }

    const pool = new Pool({
      connectionString: url.toString(),
      ssl: ssl ? ssl : undefined,
    });

    super({
      adapter: new PrismaPg(pool),
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.error('Connexion à la base de données impossible', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
