import {
  buildAlertCandidates,
  computeNiveau,
  alertKey,
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
