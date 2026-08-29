import { ConflictException, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePatientDto) {
    const anonymousCode = await this.generateAnonymousCode();

    return this.prisma.patient.create({
      data: {
        anonymousCode,
        age: dto.age,
        gender: dto.gender ?? null,
        residenceZoneId: dto.residenceZoneId,
      },
    });
  }

  list() {
    return this.prisma.patient.findMany({
      include: { residenceZone: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async generateAnonymousCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = `PAT-${new Date().getFullYear()}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;

      const exists = await this.prisma.patient.findUnique({
        where: { anonymousCode: code },
      });
      if (!exists) {
        return code;
      }
    }

    throw new ConflictException(
      'Impossible de générer un code anonyme unique.',
    );
  }
}
