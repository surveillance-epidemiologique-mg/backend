import { ConfigService } from '@nestjs/config';
import { StatutAnalyse } from '../../../generated/prisma/client';
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
