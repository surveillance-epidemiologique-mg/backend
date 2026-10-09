import { PrismaService } from '../../core/prisma/prisma.service';
import { CarteService } from './carte.service';

describe('CarteService regional summary', () => {
  it('compte tous les centres de la région, sans restriction au centre du lecteur', async () => {
    const centres = [
      { id: 1, name: 'Centre A', type: 'CSB' },
      { id: 2, name: 'Centre B', type: 'CHRD' },
    ];
    const findManyCentres = jest.fn().mockResolvedValue(centres);
    const count = jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    const prisma = {
      zoneAdministrative: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 10, name: 'Région test', type: 'Region' }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id_zone: 10 }, { id_zone: 11 }]),
      centreSante: { findMany: findManyCentres },
      casEpidemiologique: { count },
      alerte: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CarteService(prisma as unknown as PrismaService);

    const summary = await service.zoneSummary(10, 5);

    expect(findManyCentres).toHaveBeenCalledWith({
      where: { zoneId: { in: [10, 11] } },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    expect(count).toHaveBeenCalledWith({
      where: { centreId: { in: [1, 2] }, maladieId: 5 },
    });
    expect(summary).toMatchObject({
      centreCount: 2,
      centres,
      casTotal: 4,
      casConfirmes: 2,
    });
  });
});
