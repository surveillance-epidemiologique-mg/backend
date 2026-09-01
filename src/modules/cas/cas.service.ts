import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { Prisma, StatutDiag } from '../../../generated/prisma/client';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCaseDto } from './dto/create-case.dto';
import {
  AGE_BOUNDS,
  ListCasesQueryDto,
} from './dto/list-cases-query.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { UpdateResultDto } from './dto/update-result.dto';

const caseInclude = {
  patient: true,
  maladie: true,
  centre: { include: { zone: true } },
  agent: { select: { id: true, name: true } },
  laboratory: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CasService {
  constructor(private readonly prisma: PrismaService) {}

  async declare(user: AuthenticatedUser, dto: CreateCaseDto) {
    const isMedecin = user.role === ROLES.MEDECIN;

    let centreId: number;
    if (isMedecin) {
      const utilisateur = await this.prisma.utilisateur.findUnique({
        where: { id: user.id },
        select: { centreId: true },
      });
      if (utilisateur?.centreId == null) {
        throw new ForbiddenException(
          'Aucun centre de santé n’est rattaché à votre compte.',
        );
      }
      centreId = utilisateur.centreId;
    } else {
      if (!dto.centreId) {
        throw new BadRequestException('Le centre de santé est requis.');
      }
      centreId = dto.centreId;
    }

    return this.prisma.$transaction(async (tx) => {
      const centre = await tx.centreSante.findUnique({
        where: { id: centreId },
      });
      if (!centre) {
        throw new NotFoundException('Centre de santé introuvable.');
      }

      const patient = await tx.patient.create({
        data: {
          anonymousCode: await this.generateAnonymousCode(tx),
          namePatient: dto.newPatient.namePatient.trim(),
          age: dto.newPatient.age,
          gender: dto.newPatient.gender ?? null,
          residenceZoneId: centre.zoneId,
        },
      });

      return tx.casEpidemiologique.create({
        data: {
          patientId: patient.id,
          maladieId: dto.maladieId,
          centreId,
          agentId: user.id,
          diagnosticStatus: dto.diagnosticStatus ?? StatutDiag.Suspect,
          symptoms: dto.symptoms,
          diagnosisDate: new Date(),
        },
        include: caseInclude,
      });
    });
  }

  async listForUser(user: AuthenticatedUser, query: ListCasesQueryDto) {
    const isMedecin = user.role === ROLES.MEDECIN;

    if (isMedecin) {
      const utilisateur = await this.prisma.utilisateur.findUnique({
        where: { id: user.id },
        select: { centreId: true },
      });
      const centreId = utilisateur?.centreId ?? null;
      if (centreId == null) {
        return [];
      }
      return this.prisma.casEpidemiologique.findMany({
        where: this.buildCasWhere(query, centreId),
        include: caseInclude,
        orderBy: { declarationDate: 'desc' },
      });
    }

    return this.prisma.casEpidemiologique.findMany({
      where: this.buildCasWhere(query),
      include: caseInclude,
      orderBy: { declarationDate: 'desc' },
    });
  }

  async listYears(user: AuthenticatedUser) {
    const isMedecin = user.role === ROLES.MEDECIN;
    let where: Prisma.CasEpidemiologiqueWhereInput = {};

    if (isMedecin) {
      const utilisateur = await this.prisma.utilisateur.findUnique({
        where: { id: user.id },
        select: { centreId: true },
      });
      const centreId = utilisateur?.centreId ?? null;
      if (centreId == null) {
        return [];
      }
      where = { centreId };
    }

    const rows = await this.prisma.casEpidemiologique.findMany({
      where,
      select: { diagnosisDate: true },
      distinct: ['diagnosisDate'],
      orderBy: { diagnosisDate: 'asc' },
    });

    return Array.from(new Set(rows.map((r) => r.diagnosisDate.getFullYear())));
  }

  private buildCasWhere(
    query: ListCasesQueryDto,
    forcedCentreId?: number,
  ): Prisma.CasEpidemiologiqueWhereInput {
    const where: Prisma.CasEpidemiologiqueWhereInput = {};

    if (forcedCentreId !== undefined) {
      where.centreId = forcedCentreId;
    } else if (query.centreId !== undefined) {
      where.centreId = query.centreId;
    }

    if (query.maladieId !== undefined) {
      where.maladieId = query.maladieId;
    }
    if (query.statut) {
      where.diagnosticStatus = query.statut;
    }
    if (query.year !== undefined) {
      where.diagnosisDate = {
        gte: new Date(query.year, 0, 1),
        lt: new Date(query.year + 1, 0, 1),
      };
    }

    const patientWhere: Prisma.PatientWhereInput = {};
    if (query.gender) {
      patientWhere.gender = query.gender;
    }
    if (query.ageRange) {
      const bounds = AGE_BOUNDS[query.ageRange];
      patientWhere.age =
        bounds.max === null
          ? { gte: bounds.min }
          : { gte: bounds.min, lte: bounds.max };
    }
    if (query.search) {
      const term = query.search.trim();
      patientWhere.OR = [
        { namePatient: { contains: term, mode: 'insensitive' } },
        { anonymousCode: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (Object.keys(patientWhere).length > 0) {
      where.patient = patientWhere;
    }

    return where;
  }

  async mesCas(userId: number, statut?: StatutDiag) {
    return this.prisma.casEpidemiologique.findMany({
      where: {
        agentId: userId,
        ...(statut ? { diagnosticStatus: statut } : {}),
      },
      include: caseInclude,
      orderBy: { declarationDate: 'desc' },
    });
  }

  async laboratoirePending(query: ListCasesQueryDto) {
    const where = this.buildCasWhere(query);
    where.diagnosticStatus = StatutDiag.Suspect;

    return this.prisma.casEpidemiologique.findMany({
      where,
      include: caseInclude,
      orderBy: { declarationDate: 'asc' },
    });
  }

  async updateResult(laboratoryId: number, id: number, dto: UpdateResultDto) {
    const existing = await this.prisma.casEpidemiologique.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Cas introuvable.');
    }

    const updated = await this.prisma.casEpidemiologique.update({
      where: { id },
      data: {
        laboratoryId,
        labResult: dto.labResult,
        diagnosticStatus: dto.diagnosticStatus,
        analysisDate: new Date(),
      },
      include: caseInclude,
    });

    const label =
      dto.diagnosticStatus === StatutDiag.Confirme ? 'confirmé' : 'invalidé';
    await this.prisma.notification.create({
      data: {
        userId: existing.agentId,
        casId: id,
        message: `Le résultat du cas #${id} (${updated.maladie.name}) est ${label} par le laboratoire.`,
      },
    });

    return updated;
  }

  async updateIssue(userId: number, id: number, dto: UpdateIssueDto) {
    const existing = await this.prisma.casEpidemiologique.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Cas introuvable.');
    }

    if (existing.agentId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez mettre à jour que les cas que vous avez déclarés.',
      );
    }

    return this.prisma.casEpidemiologique.update({
      where: { id },
      data: {
        clinicalOutcome: dto.clinicalOutcome,
        outcomeDate: dto.outcomeDate ? new Date(dto.outcomeDate) : new Date(),
      },
      include: caseInclude,
    });
  }

  private async generateAnonymousCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = `PAT-${new Date().getFullYear()}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;

      const exists = await tx.patient.findUnique({
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