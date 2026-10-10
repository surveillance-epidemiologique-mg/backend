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
        findMany: jest.fn().mockResolvedValue([
          { id: 10, name: 'Région test' },
          { id: 12, name: 'Region test' },
        ]),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id_zone: 10 }, { id_zone: 11 }])
        .mockResolvedValueOnce([{ id_centre: 2 }]),
      centreSante: { findMany: findManyCentres },
      casEpidemiologique: { count },
      alerte: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CarteService(prisma as unknown as PrismaService);

    const summary = await service.zoneSummary(10, 5);

    expect(findManyCentres).toHaveBeenCalledWith({
      where: {
        OR: [{ zoneId: { in: [10, 11] } }, { id: { in: [2] } }],
      },
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
    expect(prisma.alerte.findMany).toHaveBeenCalledWith({
      where: {
        zoneId: { in: [10, 12] },
        statutAlerte: 'Active',
        centreId: null,
        maladieId: 5,
      },
      select: {
        niveauGravite: true,
        detectedCaseCount: true,
        maladie: { select: { name: true } },
      },
    });
  });
  it('associe une alerte régionale au polygone ADM1 malgré un nom historique', async () => {
    const prisma = {
      zoneAdministrative: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            name: 'Matsiatra Ambony',
            type: 'Region',
            parentId: null,
          },
        ]),
      },
      alerte: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ zoneId: 10, niveauGravite: 'Eleve' }]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id_zone: 20,
          nom_zone: 'Haute Matsiatra',
          geojson: '{"type":"MultiPolygon","coordinates":[]}',
        },
      ]),
    };
    const service = new CarteService(prisma as unknown as PrismaService);

    const regions = await service.regionsGeoJson();

    expect(regions.features[0].properties).toMatchObject({
      nom: 'Haute Matsiatra',
      gravite: 'Eleve',
    });
  });
});
