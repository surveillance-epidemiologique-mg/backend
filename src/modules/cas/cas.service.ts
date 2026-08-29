import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StatutDiag } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateCaseDto } from './dto/create-case.dto';
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

  async declare(userId: number, dto: CreateCaseDto) {
    return this.prisma.casEpidemiologique.create({
      data: {
        patientId: dto.patientId,
        maladieId: dto.maladieId,
        centreId: dto.centreId,
        agentId: userId,
        symptoms: dto.symptoms,
        diagnosisDate: new Date(dto.diagnosisDate),
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      include: caseInclude,
    });
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

  async laboratoirePending(centreId?: number) {
    return this.prisma.casEpidemiologique.findMany({
      where: {
        diagnosticStatus: StatutDiag.Suspect,
        ...(centreId ? { centreId } : {}),
      },
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
}
