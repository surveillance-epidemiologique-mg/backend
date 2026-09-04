import { Injectable } from '@nestjs/common';
import { StatutAlerte, StatutDiag } from '../../../generated/prisma/client';
import { ROLES } from '../../common/constants/roles';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../core/prisma/prisma.service';

interface GeoJsonFeature {
  type: 'Feature';
  geometry: unknown;
  properties: Record<string, unknown>;
}

export interface GeoJsonCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

const GRAVITE_RANK: Record<string, number> = {
  Faible: 1,
  Modere: 2,
  Eleve: 3,
  Critique: 4,
};

@Injectable()
export class CarteService {
  constructor(private readonly prisma: PrismaService) {}

  private collection(features: GeoJsonFeature[]): GeoJsonCollection {
    return { type: 'FeatureCollection', features };
  }

  private parseGeom(json: string): unknown {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  private async centreIdFor(
    user: AuthenticatedUser,
  ): Promise<number | undefined> {
    if (user.role !== ROLES.MEDECIN) {
      return undefined;
    }
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: user.id },
      select: { centreId: true },
    });
    return utilisateur?.centreId ?? -1;
  }

  /**
   * Couche "Limites administratives" (choroplèthe).
   * Chaque zone reçoit la gravité maximale de ses alertes actives
   * (coloration) ainsi que les détails de l'alerte la plus grave.
   */
  async zonesGeoJson(): Promise<GeoJsonCollection> {
    const rows = await this.prisma.$queryRaw<
      { id_zone: number; nom_zone: string; type_zone: string; geojson: string | null }[]
    >`
      SELECT
        z.id_zone,
        z.nom_zone,
        z.type_zone,
        ST_AsGeoJSON(
          COALESCE(
            z.geometrie,
            ST_Buffer(ST_Centroid(ST_Collect(ct.localisation)), 0.6)
          )
        ) AS geojson
      FROM zones_administratives z
      LEFT JOIN centres_sante ct ON ct.id_zone = z.id_zone
      WHERE z.geometrie IS NOT NULL OR ct.localisation IS NOT NULL
      GROUP BY z.id_zone, z.nom_zone, z.type_zone, z.geometrie`;

    const alertes = await this.prisma.alerte.findMany({
      where: { statutAlerte: StatutAlerte.Active },
      select: {
        zoneId: true,
        niveauGravite: true,
        detectedCaseCount: true,
        detectionDate: true,
        maladie: { select: { name: true } },
      },
    });

    // Pour chaque zone : alerte la plus grave.
    const alerteParZone = new Map<
      number,
      {
        gravite: string;
        maladie: string;
        cas: number;
        date: Date;
      }
    >();
    for (const a of alertes) {
      const current = alerteParZone.get(a.zoneId);
      const rank = GRAVITE_RANK[a.niveauGravite] ?? 0;
      if (!current || rank > (GRAVITE_RANK[current.gravite] ?? 0)) {
        alerteParZone.set(a.zoneId, {
          gravite: a.niveauGravite,
          maladie: a.maladie.name,
          cas: a.detectedCaseCount,
          date: a.detectionDate,
        });
      }
    }

    const features: GeoJsonFeature[] = [];
    for (const r of rows) {
      if (!r.geojson) continue;
      const geom = this.parseGeom(r.geojson);
      if (!geom) continue;
      const alerte = alerteParZone.get(r.id_zone);
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: {
          id: r.id_zone,
          nom: r.nom_zone,
          type: r.type_zone,
          gravite: alerte?.gravite ?? null,
          alerteMaladie: alerte?.maladie ?? null,
          alerteCas: alerte?.cas ?? null,
          alerteDate: alerte?.date ?? null,
        },
      });
    }
    return this.collection(features);
  }

  /** Couche "Centres de santé" (marqueurs). */
  async centresGeoJson(): Promise<GeoJsonCollection> {
    const rows = await this.prisma.$queryRaw<
      {
        id_centre: number;
        nom_centre: string;
        type_centre: string;
        nom_zone: string | null;
        geojson: string | null;
      }[]
    >`
      SELECT
        c.id_centre,
        c.nom_centre,
        c.type_centre,
        z.nom_zone,
        ST_AsGeoJSON(c.localisation) AS geojson
      FROM centres_sante c
      LEFT JOIN zones_administratives z ON z.id_zone = c.id_zone
      WHERE c.localisation IS NOT NULL`;

    const features: GeoJsonFeature[] = [];
    for (const r of rows) {
      if (!r.geojson) continue;
      const geom = this.parseGeom(r.geojson);
      if (!geom) continue;
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: {
          id: r.id_centre,
          nom: r.nom_centre,
          type: r.type_centre,
          zone: r.nom_zone,
        },
      });
    }
    return this.collection(features);
  }

  /** Couche "Alertes" actives (polygones colorés selon niveau de gravité). */
  async alertesGeoJson(): Promise<GeoJsonCollection> {
    const rows = await this.prisma.$queryRaw<
      {
        id_alerte: number;
        nom_maladie: string;
        nom_zone: string;
        niveau_gravite: string;
        nombre_cas_detectes: number;
        date_detection: Date;
        geojson: string | null;
      }[]
    >`
      SELECT
        a.id_alerte,
        m.nom_maladie,
        z.nom_zone,
        a.niveau_gravite,
        a.nombre_cas_detectes,
        a.date_detection,
        ST_AsGeoJSON(a.emprise_spatiale) AS geojson
      FROM alertes a
      JOIN maladies m ON m.id_maladie = a.id_maladie
      JOIN zones_administratives z ON z.id_zone = a.id_zone
      WHERE a.statut_alerte = 'Active' AND a.emprise_spatiale IS NOT NULL`;

    const features: GeoJsonFeature[] = [];
    for (const r of rows) {
      if (!r.geojson) continue;
      const geom = this.parseGeom(r.geojson);
      if (!geom) continue;
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: {
          id: r.id_alerte,
          maladie: r.nom_maladie,
          zone: r.nom_zone,
          gravite: r.niveau_gravite,
          cas: r.nombre_cas_detectes,
          date: r.date_detection,
        },
      });
    }
    return this.collection(features);
  }

  /**
   * Couche "Cas" (marqueurs colorés selon le statut diagnostic).
   * Localisation par le centre de santé (proxy). Filtres statut + maladie.
   * Médecin limité à son centre.
   */
  async casGeoJson(
    user: AuthenticatedUser,
    statut?: StatutDiag,
    maladieId?: number,
  ): Promise<GeoJsonCollection> {
    const centreId = await this.centreIdFor(user);

    const centres = await this.prisma.$queryRaw<
      { id_centre: number; geojson: string | null }[]
    >`
      SELECT id_centre, ST_AsGeoJSON(localisation) AS geojson
      FROM centres_sante WHERE localisation IS NOT NULL`;
    const pointByCentre = new Map(
      centres.map((c) => [c.id_centre, c.geojson]),
    );

    const cas = await this.prisma.casEpidemiologique.findMany({
      where: {
        ...(statut ? { diagnosticStatus: statut } : {}),
        ...(maladieId ? { maladieId } : {}),
        ...(centreId !== undefined ? { centreId } : {}),
      },
      select: {
        id: true,
        diagnosticStatus: true,
        patient: { select: { anonymousCode: true } },
        maladie: { select: { name: true } },
        centre: { select: { id: true, name: true } },
      },
    });

    const features: GeoJsonFeature[] = [];
    for (const c of cas) {
      const geojson = pointByCentre.get(c.centre.id);
      if (!geojson) continue;
      const geom = this.parseGeom(geojson);
      if (!geom) continue;
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: {
          id: c.id,
          code: c.patient.anonymousCode,
          maladie: c.maladie.name,
          centre: c.centre.name,
          statut: c.diagnosticStatus,
        },
      });
    }
    return this.collection(features);
  }

  /**
   * Heatmap / clustering (MAP-03) : ST_ClusterDBSCAN + ST_Centroid.
   * La localisation des cas est approchée par celle de leur centre de santé.
   */
  async clustersGeoJson(): Promise<GeoJsonCollection> {
    const eps = Number(process.env.CLUSTER_EPS ?? 0.35);
    const rows = await this.prisma.$queryRaw<
      { cluster_id: number | null; nb: number; geojson: string | null }[]
    >`
      WITH pts AS (
        SELECT ct.localisation AS geom
        FROM cas_epidemiologiques c
        JOIN centres_sante ct ON ct.id_centre = c.id_centre
        WHERE c.statut_diagnostic = 'Confirme' AND ct.localisation IS NOT NULL
      ),
      clustered AS (
        SELECT ST_ClusterDBSCAN(geom, eps := ${eps}, minpoints := 1) OVER () AS cluster_id, geom
        FROM pts
      )
      SELECT
        cluster_id,
        COUNT(*)::int AS nb,
        ST_AsGeoJSON(ST_Centroid(ST_Collect(geom))) AS geojson
      FROM clustered
      GROUP BY cluster_id`;

    const features: GeoJsonFeature[] = [];
    for (const r of rows) {
      if (!r.geojson) continue;
      const geom = this.parseGeom(r.geojson);
      if (!geom) continue;
      features.push({
        type: 'Feature',
        geometry: geom,
        properties: { cluster: r.cluster_id, nb: r.nb },
      });
    }
    return this.collection(features);
  }
}