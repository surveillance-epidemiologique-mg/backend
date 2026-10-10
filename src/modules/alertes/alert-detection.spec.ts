import { Prisma, StatutDiag, TypeZone } from '../../../generated/prisma/client';
import {
  buildAlertCandidates,
  computeNiveau,
  alertKey,
  syncAlerts,
} from './alert-detection';

const diseases = [{ id: 1, alertThresholdCentre: 3, alertThresholdRegion: 8 }];
const zones = [
  { id: 10, parentId: 100 },
  { id: 20, parentId: 100 },
  { id: 100, parentId: null },
];
const centres = [
  { id: 1, zoneId: 10 },
  { id: 2, zoneId: 20 },
];

describe('Dual-scale alert detection', () => {
  it('keeps a centre-only outbreak out of administrative alerts', () => {
    const result = buildAlertCandidates(diseases, centres, zones, [
      { centreId: 1, maladieId: 1, count: 4 },
    ]);
    expect(result).toEqual([
      {
        centreId: 1,
        zoneId: 10,
        maladieId: 1,
        detectedCaseCount: 4,
        niveauGravite: 'Faible',
      },
    ]);
  });
  it('aggregates across districts and retains both centre alerts', () => {
    const result = buildAlertCandidates(diseases, centres, zones, [
      { centreId: 1, maladieId: 1, count: 4 },
      { centreId: 2, maladieId: 1, count: 4 },
    ]);
    expect(result.map(alertKey).sort()).toEqual([
      'centre:1:1',
      'centre:2:1',
      'zone:100:1',
    ]);
    expect(result.find((a) => a.centreId == null)?.detectedCaseCount).toBe(8);
  });
  it('can trigger the regional threshold without any centre reaching its threshold', () => {
    const result = buildAlertCandidates(
      [{ ...diseases[0], alertThresholdCentre: 5 }],
      centres,
      zones,
      [
        { centreId: 1, maladieId: 1, count: 4 },
        { centreId: 2, maladieId: 1, count: 4 },
      ],
    );
    expect(result.map(alertKey)).toEqual(['zone:100:1']);
  });
  it('includes equality, separates diseases and excludes sub-threshold counts', () => {
    const result = buildAlertCandidates(
      [
        ...diseases,
        { id: 2, alertThresholdCentre: 4, alertThresholdRegion: 5 },
      ],
      centres,
      zones,
      [
        { centreId: 1, maladieId: 1, count: 3 },
        { centreId: 1, maladieId: 2, count: 2 },
      ],
    );
    expect(result.map(alertKey)).toEqual(['centre:1:1']);
  });
  it('handles empty data and hierarchy cycles without double-counting', () => {
    expect(buildAlertCandidates(diseases, centres, zones, [])).toEqual([]);
    const result = buildAlertCandidates(
      diseases,
      centres,
      [{ id: 10, parentId: 10 }],
      [{ centreId: 1, maladieId: 1, count: 8 }],
    );
    expect(result.find((a) => a.centreId == null)?.detectedCaseCount).toBe(8);
  });
  it('attributes production cases to the ADM1 polygon even with a legacy regional link', () => {
    const result = buildAlertCandidates(
      [{ id: 1, alertThresholdCentre: 5, alertThresholdRegion: 1 }],
      [{ id: 1, zoneId: 10 }],
      [
        { id: 10, parentId: 100, type: TypeZone.District },
        { id: 100, parentId: null, type: TypeZone.Region },
        { id: 200, parentId: null, type: TypeZone.Region },
      ],
      [{ centreId: 1, maladieId: 1, count: 2 }],
      new Map([[1, 200]]),
    );

    expect(result.map(alertKey).sort()).toEqual(['zone:10:1', 'zone:200:1']);
    expect(result.find((a) => a.zoneId === 200)).toMatchObject({
      detectedCaseCount: 2,
      niveauGravite: 'Eleve',
    });
  });
  it('compte les anciens cas confirmés sans limite basse, mais exclut les dates futures', async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ centreId: 1, maladieId: 1, _count: { _all: 2 } }]);
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      maladie: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 1, alertThresholdCentre: 3, alertThresholdRegion: 2 },
          ]),
      },
      centreSante: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, zoneId: 100 }]),
      },
      zoneAdministrative: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 100, parentId: null, type: TypeZone.Region },
          ]),
      },
      casEpidemiologique: { groupBy },
      alerte: { findMany: jest.fn().mockResolvedValue([]), create },
    } as unknown as Prisma.TransactionClient;
    const now = new Date('2026-10-10T12:00:00Z');

    const result = await syncAlerts(tx, now);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['centreId', 'maladieId'],
      where: {
        diagnosticStatus: StatutDiag.Confirme,
        diagnosisDate: { lte: now },
      },
      _count: { _all: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        centreId: null,
        zoneId: 100,
        maladieId: 1,
        detectedCaseCount: 2,
        niveauGravite: 'Faible',
        detectionDate: now,
        statutAlerte: 'Active',
      },
    });
    expect(result).toEqual({ created: 1, updated: 0, closed: 0 });
  });
  it.each([
    [4, 'Faible'],
    [6, 'Modere'],
    [8, 'Eleve'],
    [12, 'Critique'],
  ])(
    'computes severity for %i cases against a threshold of 4',
    (count, severity) => {
      expect(computeNiveau(count, 4)).toBe(severity);
    },
  );
});
