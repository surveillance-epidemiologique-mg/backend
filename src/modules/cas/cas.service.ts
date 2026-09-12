import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { Prisma, StatutAnalyse, StatutDiag, TypeResultatAttendu } from '../../../generated/prisma/client';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { CreateAnalyseDto } from './dto/create-analyse.dto';
import {
  AGE_BOUNDS,
  ListCasesQueryDto,
} from './dto/list-cases-query.dto';
import { UpdateAnalyseResultDto } from './dto/update-analyse-result.dto';
import { ValidateCaseDto } from './dto/validate-case.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { UpdateResultDto } from './dto/update-result.dto';

const caseInclude = {
  patient: true,
  maladie: true,
  centre: { include: { zone: true } },
  agent: { select: { id: true, name: true } },
  decisionAnalyse: {
    include: { laboratory: { select: { id: true, name: true } } },
  },
  analyses: {
    include: { laboratory: { select: { id: true, name: true } } },
  },
} as const;

const analyseInclude = {
  laboratory: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CasService {
  private readonly logger = new Logger(CasService.name);

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

      const cas = await tx.casEpidemiologique.create({
        data: {
          patientId: patient.id,
          maladieId: dto.maladieId,
          centreId,
          agentId: user.id,
          diagnosticStatus: dto.diagnosticStatus ?? StatutDiag.Suspect,
          symptoms: dto.symptoms,
          diagnosisDate: new Date(),
        },
      });

      if (dto.analyses && dto.analyses.length > 0) {
        await tx.analyse.createMany({
          data: dto.analyses.map((a) => ({
            casId: cas.id,
            label: a.label.trim(),
            resultType: a.typeResultatAttendu,
            statut: StatutAnalyse.Demandee,
            dateDemande: new Date(),
          })),
        });
      }

      const created = await tx.casEpidemiologique.findUnique({
        where: { id: cas.id },
        include: caseInclude,
      });
      this.logger.log(
        `Cas #${cas.id} déclaré par user #${user.id} (centre #${centreId}, ${dto.analyses?.length ?? 0} analyse(s))`,
      );
      return created;
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

  async findOne(user: AuthenticatedUser, id: number) {
    const cas = await this.prisma.casEpidemiologique.findUnique({
      where: { id },
      include: caseInclude,
    });
    if (!cas) {
      throw new NotFoundException('Cas introuvable.');
    }

    if (user.role === ROLES.MEDECIN) {
      const utilisateur = await this.prisma.utilisateur.findUnique({
        where: { id: user.id },
        select: { centreId: true },
      });
      if (cas.centreId !== utilisateur?.centreId) {
        throw new ForbiddenException('Accès refusé à ce cas.');
      }
    }

    return cas;
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
    if (
      query.year !== undefined ||
      query.month !== undefined ||
      query.day !== undefined
    ) {
      const year = query.year ?? new Date().getFullYear();
      const month = query.month ?? 1;
      const start = new Date(Date.UTC(year, month - 1, query.day ?? 1));
      const end =
        query.day !== undefined
          ? new Date(Date.UTC(year, month - 1, query.day + 1))
          : query.month !== undefined
            ? new Date(Date.UTC(year, month, 1))
            : new Date(Date.UTC(year + 1, 0, 1));
      where.diagnosisDate = { gte: start, lt: end };
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

  async laboratoirePending(
    user: AuthenticatedUser,
    query: ListCasesQueryDto,
  ) {
    const where = this.buildCasWhere(query);
    delete where.diagnosticStatus;
    where.OR = [
      { diagnosticStatus: StatutDiag.Suspect },
      { analyses: { some: { laboratoryId: user.id } } },
    ];

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

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.analyse.create({
        data: {
          casId: id,
          label: 'Analyse initiale',
          resultType: TypeResultatAttendu.TexteLibre,
          resultat: dto.labResult,
          statut: StatutAnalyse.Realisee,
          laboratoryId,
          dateAnalyse: new Date(),
        },
      });
      return tx.casEpidemiologique.update({
        where: { id },
        data: { diagnosticStatus: dto.diagnosticStatus },
        include: caseInclude,
      });
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

  async createAnalyse(casId: number, dto: CreateAnalyseDto) {
    const cas = await this.prisma.casEpidemiologique.findUnique({
      where: { id: casId },
      select: { id: true },
    });
    if (!cas) {
      throw new NotFoundException('Cas introuvable.');
    }

    return this.prisma.analyse.create({
      data: {
        casId,
        label: dto.label.trim(),
        resultType: dto.typeResultatAttendu,
        statut: StatutAnalyse.Demandee,
        dateDemande: new Date(),
      },
      include: analyseInclude,
    });
  }

  async listAnalyses(casId: number) {
    const cas = await this.prisma.casEpidemiologique.findUnique({
      where: { id: casId },
      select: { id: true },
    });
    if (!cas) {
      throw new NotFoundException('Cas introuvable.');
    }

    return this.prisma.analyse.findMany({
      where: { casId },
      include: analyseInclude,
      orderBy: { dateDemande: 'desc' },
    });
  }

  async realizeAnalyse(
    laboratoryId: number,
    analyseId: number,
    dto: UpdateAnalyseResultDto,
  ) {
    const analyse = await this.prisma.analyse.findUnique({
      where: { id: analyseId },
    });
    if (!analyse) {
      throw new NotFoundException('Analyse introuvable.');
    }

    // Une analyse déjà réalisée par un autre laboratoire n'est pas modifiable.
    if (
      analyse.statut === StatutAnalyse.Realisee &&
      analyse.laboratoryId !== laboratoryId
    ) {
      throw new ForbiddenException(
        'Cette analyse a été réalisée par un autre laboratoire.',
      );
    }

    const updated = await this.prisma.analyse.update({
      where: { id: analyseId },
      data: {
        resultat: dto.resultat,
        statut: StatutAnalyse.Realisee,
        laboratoryId,
        dateAnalyse: new Date(),
      },
      include: analyseInclude,
    });

    this.logger.log(
      `Analyse #${analyseId} réalisée par labo #${laboratoryId} (cas #${analyse.casId})`,
    );
    return updated;
  }

  /**
   * Confirme / invalide un cas dès qu'au moins une analyse est réalisée.
   * Consigne la référence de l'analyse ayant permis la décision et notifie le prescripteur.
   */
  async validateCase(userId: number, casId: number, dto: ValidateCaseDto) {
    const cas = await this.prisma.casEpidemiologique.findUnique({
      where: { id: casId },
      select: {
        agentId: true,
        maladie: { select: { name: true } },
      },
    });
    if (!cas) {
      throw new NotFoundException('Cas introuvable.');
    }

    let decisionAnalyseId: number;
    if (dto.analyseId) {
      const analyse = await this.prisma.analyse.findUnique({
        where: { id: dto.analyseId },
      });
      if (!analyse || analyse.casId !== casId) {
        throw new BadRequestException("Analyse invalide pour ce cas.");
      }
      if (analyse.statut !== StatutAnalyse.Realisee) {
        throw new BadRequestException(
          "L'analyse doit être réalisée avant de confirmer le cas.",
        );
      }
      decisionAnalyseId = analyse.id;
    } else {
      const mine = await this.prisma.analyse.findFirst({
        where: { casId, statut: StatutAnalyse.Realisee, laboratoryId: userId },
        orderBy: { dateAnalyse: 'desc' },
      });
      const anyRealised = await this.prisma.analyse.findFirst({
        where: { casId, statut: StatutAnalyse.Realisee },
        orderBy: { dateAnalyse: 'desc' },
      });
      const chosen = mine ?? anyRealised;
      if (!chosen) {
        throw new BadRequestException(
          'Aucune analyse réalisée : impossible de confirmer ou invalider le cas.',
        );
      }
      decisionAnalyseId = chosen.id;
    }

    const updated = await this.prisma.casEpidemiologique.update({
      where: { id: casId },
      data: {
        diagnosticStatus: dto.diagnosticStatus,
        decisionAnalyseId,
      },
      include: caseInclude,
    });

    this.logger.log(
      `Cas #${casId} ${dto.diagnosticStatus === StatutDiag.Confirme ? 'confirmé' : 'invalidé'} par user #${userId} (analyse de décision #${decisionAnalyseId})`,
    );

    const label =
      dto.diagnosticStatus === StatutDiag.Confirme ? 'confirmé' : 'invalidé';
    await this.prisma.notification.create({
      data: {
        userId: cas.agentId,
        casId,
        message: `Le cas #${casId} (${cas.maladie.name}) a été ${label} par le laboratoire.`,
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