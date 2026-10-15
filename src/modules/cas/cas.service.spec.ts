import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  IssueClinique,
  StatutAnalyse,
  StatutDiag,
} from '../../../generated/prisma/client';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CasService } from './cas.service';

describe('Laboratory case tabs', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const service = new CasService(
    { casEpidemiologique: { findMany } } as unknown as PrismaService,
    {} as EmailService,
    {} as ConfigService,
  );
  const laboratoryUser: AuthenticatedUser = {
    id: 17,
    id_role: 3,
    role: ROLES.LABORATOIRE,
    email: 'lab@example.test',
    tempPassword: false,
  };

  beforeEach(() => findMany.mockClear());

  it('filters pending analyses before paginating', async () => {
    await service.laboratoirePending(laboratoryUser, {
      laboratoryView: 'pending',
      page: 2,
      limit: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analyses: { some: { statut: StatutAnalyse.Demandee } } },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('shows an agent only cases they personally processed', async () => {
    await service.laboratoirePending(laboratoryUser, {
      laboratoryView: 'processed',
      page: 1,
      limit: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          analyses: {
            some: { statut: StatutAnalyse.Realisee, laboratoryId: 17 },
          },
        },
      }),
    );
  });

  it('keeps both categories in the agent’s All tab', async () => {
    await service.laboratoirePending(laboratoryUser, {
      laboratoryView: 'all',
      page: 1,
      limit: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { analyses: { some: { statut: StatutAnalyse.Demandee } } },
            {
              analyses: {
                some: { statut: StatutAnalyse.Realisee, laboratoryId: 17 },
              },
            },
          ],
        },
      }),
    );
  });

  it('shows processed cases across agents to an administrator', async () => {
    await service.laboratoirePending(
      { ...laboratoryUser, role: ROLES.ADMINISTRATEUR },
      { laboratoryView: 'processed', page: 1, limit: 10 },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analyses: { some: { statut: StatutAnalyse.Realisee } } },
      }),
    );
  });
});

describe('Clinical outcome', () => {
  const findUnique = jest.fn();
  const update = jest.fn<
    Promise<unknown>,
    [
      {
        where: { id: number };
        data: { clinicalOutcome: IssueClinique; outcomeDate: Date | null };
      },
    ]
  >();
  const findUser = jest.fn();
  const service = new CasService(
    {
      casEpidemiologique: { findUnique, update },
      utilisateur: { findUnique: findUser },
    } as unknown as PrismaService,
    {} as EmailService,
    { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService,
  );
  const doctor: AuthenticatedUser = {
    id: 17,
    id_role: 2,
    role: ROLES.MEDECIN,
    email: 'doctor@example.test',
    tempPassword: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      id: 42,
      centreId: 3,
      diagnosticStatus: StatutDiag.Confirme,
    });
    findUser.mockResolvedValue({ centreId: 3 });
    update.mockResolvedValue({ id: 42, clinicalOutcome: IssueClinique.Deces });
  });

  it('records a death for a confirmed case in the doctor’s centre', async () => {
    await service.updateIssue(doctor, 42, {
      clinicalOutcome: IssueClinique.Deces,
    });

    const args = update.mock.calls[0]?.[0];
    expect(args?.where.id).toBe(42);
    expect(args?.data.clinicalOutcome).toBe(IssueClinique.Deces);
    expect(args?.data.outcomeDate).toBeInstanceOf(Date);
  });

  it('rejects a case outside the doctor’s centre', async () => {
    findUser.mockResolvedValue({ centreId: 8 });

    await expect(
      service.updateIssue(doctor, 42, { clinicalOutcome: IssueClinique.Deces }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an outcome on an unconfirmed case', async () => {
    findUnique.mockResolvedValue({
      id: 42,
      centreId: 3,
      diagnosticStatus: StatutDiag.Suspect,
    });

    await expect(
      service.updateIssue(doctor, 42, { clinicalOutcome: IssueClinique.Gueri }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('lets an administrator update any centre and clears the date when reopened', async () => {
    await service.updateIssue({ ...doctor, role: ROLES.ADMINISTRATEUR }, 42, {
      clinicalOutcome: IssueClinique.EnCours,
    });

    expect(findUser).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { clinicalOutcome: IssueClinique.EnCours, outcomeDate: null },
      }),
    );
  });
});
