import { IssueClinique, StatutDiag } from '../../../generated/prisma/client';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('Dashboard lethality', () => {
  const groupBy = jest.fn();
  const count = jest.fn().mockResolvedValue(0);
  const service = new DashboardService({
    casEpidemiologique: { groupBy },
    alerte: { count },
  } as unknown as PrismaService);
  const admin: AuthenticatedUser = {
    id: 1,
    id_role: 1,
    role: ROLES.ADMINISTRATEUR,
    email: 'admin@example.test',
    tempPassword: false,
  };

  it('counts deaths only among confirmed cases and uses all confirmed cases as denominator', async () => {
    groupBy.mockResolvedValue([
      {
        diagnosticStatus: StatutDiag.Confirme,
        clinicalOutcome: IssueClinique.Deces,
        _count: { _all: 2 },
      },
      {
        diagnosticStatus: StatutDiag.Confirme,
        clinicalOutcome: IssueClinique.Gueri,
        _count: { _all: 3 },
      },
      {
        diagnosticStatus: StatutDiag.Confirme,
        clinicalOutcome: IssueClinique.PerduDeVue,
        _count: { _all: 1 },
      },
      {
        diagnosticStatus: StatutDiag.Suspect,
        clinicalOutcome: IssueClinique.EnCours,
        _count: { _all: 4 },
      },
    ]);

    const result = await service.kpi(admin, {});

    expect(result).toMatchObject({ confirmed: 6, deces: 2, letalite: 33.3 });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['diagnosticStatus', 'clinicalOutcome'],
      }),
    );
  });
});
