import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePatientDto) {
    const anonymousCode = await this.generateAnonymousCode();

    const patient = await this.prisma.patient.create({
      data: {
        anonymousCode,
        namePatient: dto.namePatient.trim(),
        age: dto.age,
        gender: dto.gender ?? null,
        residenceZoneId: dto.residenceZoneId,
      },
    });
    this.logger.log(`Patient créé #${patient.id} (${anonymousCode})`);
    return patient;
  }

  list() {
    return this.prisma.patient.findMany({
      include: { residenceZone: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: AuthenticatedUser, id: number) {
    await this.ensurePatientAccess(user, id);

    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        residenceZone: true,
        cas: {
          include: {
            maladie: true,
            agent: { select: { id: true, name: true } },
            centre: { select: { id: true, name: true } },
          },
          orderBy: { declarationDate: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }
    return patient;
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdatePatientDto) {
    await this.ensurePatientAccess(user, id);

    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Patient introuvable.');
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        ...(dto.namePatient !== undefined
          ? { namePatient: dto.namePatient.trim() }
          : {}),
        ...(dto.age !== undefined ? { age: dto.age } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      },
    });
    this.logger.log(
      `Patient #${id} modifié par user #${user.id} (${updated.anonymousCode})`,
    );
    return updated;
  }

  async remove(user: AuthenticatedUser, id: number) {
    await this.ensurePatientAccess(user, id);

    const existing = await this.prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Patient introuvable.');
    }

    const casCount = await this.prisma.casEpidemiologique.count({
      where: { patientId: id },
    });

    // Suppression en cascade : les cas associés (et leurs analyses) sont
    // supprimés via la contrainte ON DELETE CASCADE de la base.
    await this.prisma.patient.delete({ where: { id } });
    this.logger.log(
      `Patient #${id} supprimé (cascade, ${casCount} cas) par user #${user.id}`,
    );
    return { deleted: true, cascadedCases: casCount };
  }

  private async ensurePatientAccess(
    user: AuthenticatedUser,
    patientId: number,
  ) {
    if (user.role !== ROLES.MEDECIN) {
      return;
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: user.id },
      select: { centreId: true },
    });
    const centreId = utilisateur?.centreId ?? null;
    if (centreId == null) {
      throw new ForbiddenException(
        'Aucun centre de santé rattaché à votre compte.',
      );
    }

    const linked = await this.prisma.casEpidemiologique.count({
      where: { patientId, centreId },
    });
    if (linked === 0) {
      throw new ForbiddenException(
        'Ce patient n’est rattaché à aucun cas de votre centre de santé.',
      );
    }
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