import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export type ReportType =
  'daily' | 'weekly' | 'monthly' | 'disease' | 'region' | 'custom';

export interface ReportDataset {
  meta: {
    type: ReportType;
    from: string | null;
    to: string | null;
    maladieId: number | null;
    regionId: number | null;
    districtId: number | null;
    generatedAt: string;
  };
  totals: {
    total: number;
    confirmed: number;
    suspect: number;
    active: number;
    recovered: number;
    deceased: number;
    lethalityRate: number;
    recoveryRate: number;
  };
  byDisease: {
    maladie: string;
    total: number;
    confirmed: number;
    suspect: number;
    active: number;
    recovered: number;
    deceased: number;
  }[];
  matrix: {
    maladie: string;
    region: string;
    total: number;
    confirmed: number;
    suspect: number;
    active: number;
    recovered: number;
    deceased: number;
  }[];
  byRegion: {
    region: string;
    total: number;
    active: number;
    recovered: number;
    deceased: number;
  }[];
  evolution: { date: string; count: number }[];
  signalements: {
    total: number;
    enAttente: number;
    valides: number;
    rejetes: number;
    brouillons: number;
  };
}

export interface ReportQuery {
  type: ReportType;
  from?: string;
  to?: string;
  maladieId?: number;
  regionId?: number;
  districtId?: number;
}

interface Scope {
  userId: number;
  regionId?: number;
  districtId?: number;
}

const FROM_CLAUSE = Prisma.sql`
  FROM cas_epidemiologiques c
  JOIN centres_sante ct ON ct.id_centre = c.id_centre
  JOIN zones_administratives z ON z.id_zone = ct.id_zone
  LEFT JOIN zones_administratives zp ON zp.id_zone = z.id_zone_parent
`;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(userId: number, query: ReportQuery): Promise<ReportDataset> {
    const scope = await this.resolveScope(userId);
    const { from, to } = this.resolvePeriod(query);

    const where = this.buildCaseWhere(scope, query);
    const sigWhere = this.buildSignalementWhere(scope, query, from, to);

    const [totals, matrix, byRegion, evolution, signalements] =
      await Promise.all([
        this.totals(where),
        this.matrix(where),
        this.byRegion(where),
        this.evolution(where, query, from, to),
        this.signalementSummary(sigWhere),
      ]);

    return {
      meta: {
        type: query.type,
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
        maladieId: query.maladieId ?? null,
        regionId: scope.regionId ?? null,
        districtId: scope.districtId ?? null,
        generatedAt: new Date().toISOString(),
      },
      totals,
      byDisease: this.aggregateByDisease(matrix),
      matrix,
      byRegion,
      evolution,
      signalements,
    };
  }

  // ---- Aggregations SQL ----

  private buildCaseWhere(scope: Scope, query: ReportQuery): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    if (query.maladieId !== undefined) {
      conds.push(Prisma.sql`c.id_maladie = ${query.maladieId}`);
    }
    if (scope.districtId !== undefined) {
      conds.push(Prisma.sql`ct.id_zone = ${scope.districtId}`);
    } else if (scope.regionId !== undefined) {
      conds.push(Prisma.sql`zp.id_zone = ${scope.regionId}`);
    } else if (query.districtId !== undefined) {
      conds.push(Prisma.sql`ct.id_zone = ${query.districtId}`);
    } else if (query.regionId !== undefined) {
      conds.push(Prisma.sql`zp.id_zone = ${query.regionId}`);
    }
    return conds.length
      ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
      : Prisma.empty;
  }

  private buildSignalementWhere(
    scope: Scope,
    query: ReportQuery,
    from?: Date,
    to?: Date,
  ): Prisma.SignalementWhereInput {
    const where: Prisma.SignalementWhereInput = {};
    if (query.maladieId) where.maladieId = query.maladieId;
    if (scope.districtId) where.districtId = scope.districtId;
    else if (scope.regionId) where.regionId = scope.regionId;
    else if (query.districtId) where.districtId = query.districtId;
    else if (query.regionId) where.regionId = query.regionId;
    if (from || to) {
      where.dateSignalement = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    return where;
  }

  private async resolveScope(userId: number): Promise<Scope> {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return { userId };
    }
    // Périmètre : un utilisateur régional ne peut rapporter que sa région ;
    // un agent de santé que son district (centre).
    if (user.regionId) {
      return { userId, regionId: user.regionId };
    }
    if (user.centreId) {
      const centre = await this.prisma.centreSante.findUnique({
        where: { id: user.centreId },
      });
      return { userId, districtId: centre?.zoneId ?? undefined };
    }
    return { userId };
  }

  private resolvePeriod(query: ReportQuery): { from?: Date; to?: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    switch (query.type) {
      case 'daily':
        return { from: to, to };
      case 'weekly': {
        const from = new Date(to);
        from.setDate(from.getDate() - 6);
        return { from, to };
      }
      case 'monthly': {
        const from = new Date(to);
        from.setDate(from.getDate() - 29);
        return { from, to };
      }
      default: {
        const from = query.from ? new Date(query.from) : undefined;
        return { from, to };
      }
    }
  }

  private async totals(where: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<
      {
        total: number;
        confirmed: number;
        suspect: number;
        active: number;
        recovered: number;
        deceased: number;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspect,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased
      ${FROM_CLAUSE}
      ${where}
    `);
    const row = rows[0] ?? {
      total: 0,
      confirmed: 0,
      suspect: 0,
      active: 0,
      recovered: 0,
      deceased: 0,
    };
    return {
      ...row,
      lethalityRate:
        row.total > 0
          ? Math.round((row.deceased / row.total) * 10000) / 100
          : 0,
      recoveryRate:
        row.total > 0
          ? Math.round((row.recovered / row.total) * 10000) / 100
          : 0,
    };
  }

  private async matrix(where: Prisma.Sql) {
    return this.prisma.$queryRaw<
      {
        maladie: string;
        region: string;
        total: number;
        confirmed: number;
        suspect: number;
        active: number;
        recovered: number;
        deceased: number;
      }[]
    >(Prisma.sql`
      SELECT
        m.nom_maladie AS maladie,
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Confirme')::int AS confirmed,
        COUNT(*) FILTER (WHERE c.statut_diagnostic = 'Suspect')::int AS suspect,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased
      ${FROM_CLAUSE}
      JOIN maladies m ON m.id_maladie = c.id_maladie
      ${where}
      GROUP BY m.nom_maladie, zp.nom_zone
      ORDER BY m.nom_maladie, total DESC
    `);
  }

  private async byRegion(where: Prisma.Sql) {
    return this.prisma.$queryRaw<
      {
        region: string;
        total: number;
        active: number;
        recovered: number;
        deceased: number;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(zp.nom_zone, 'Inconnue') AS region,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'En_cours')::int AS active,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Gueri')::int AS recovered,
        COUNT(*) FILTER (WHERE c.issue_clinique = 'Deces')::int AS deceased
      ${FROM_CLAUSE}
      ${where}
      GROUP BY zp.nom_zone
      ORDER BY total DESC
    `);
  }

  private async evolution(
    where: Prisma.Sql,
    query: ReportQuery,
    from?: Date,
    to?: Date,
  ) {
    const length = to && from ? to.getTime() - from.getTime() : 0;
    const bucket =
      query.type === 'monthly' || length > 45 * 86400000
        ? Prisma.sql`to_char(date_trunc('month', c.date_declaration), 'YYYY-MM')`
        : query.type === 'weekly' || length > 8 * 86400000
          ? Prisma.sql`to_char(date_trunc('week', c.date_declaration), 'YYYY-MM-DD')`
          : Prisma.sql`to_char(c.date_declaration, 'YYYY-MM-DD')`;

    return this.prisma.$queryRaw<{ date: string; count: number }[]>(
      Prisma.sql`
        SELECT ${bucket} AS date, COUNT(*)::int AS count
        ${FROM_CLAUSE}
        ${where}
        GROUP BY date
        ORDER BY date ASC
      `,
    );
  }

  private async signalementSummary(where: Prisma.SignalementWhereInput) {
    const groups = await this.prisma.signalement.groupBy({
      by: ['statut'],
      where,
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    let total = 0;
    for (const group of groups) {
      out[group.statut] = group._count._all;
      total += group._count._all;
    }
    return {
      total,
      enAttente: out['EnAttente'] ?? 0,
      valides: out['Valide'] ?? 0,
      rejetes: out['Rejete'] ?? 0,
      brouillons: out['Brouillon'] ?? 0,
    };
  }

  private aggregateByDisease(
    matrix: {
      maladie: string;
      total: number;
      confirmed: number;
      suspect: number;
      active: number;
      recovered: number;
      deceased: number;
    }[],
  ) {
    const map = new Map<
      string,
      {
        maladie: string;
        total: number;
        confirmed: number;
        suspect: number;
        active: number;
        recovered: number;
        deceased: number;
      }
    >();
    for (const row of matrix) {
      const existing = map.get(row.maladie) ?? {
        maladie: row.maladie,
        total: 0,
        confirmed: 0,
        suspect: 0,
        active: 0,
        recovered: 0,
        deceased: 0,
      };
      existing.total += row.total;
      existing.confirmed += row.confirmed;
      existing.suspect += row.suspect;
      existing.active += row.active;
      existing.recovered += row.recovered;
      existing.deceased += row.deceased;
      map.set(row.maladie, existing);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  // ---- Import ----

  parseCsv(text: string): string[][] {
    const delimiter = text.includes(';') ? ';' : ',';
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(cell.trim());
        cell = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[i + 1] === '\n') {
          i++;
        }
        row.push(cell.trim());
        cell = '';
        if (row.some((c) => c !== '')) {
          rows.push(row);
        }
        row = [];
      } else {
        cell += char;
      }
    }
    row.push(cell.trim());
    if (row.some((c) => c !== '')) {
      rows.push(row);
    }
    return rows;
  }

  async importCsv(userId: number, buffer: Buffer) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows = this.parseCsv(text);
    const dataRows = rows
      .slice(1)
      .filter((r) => r.some((c) => c.trim() !== ''));
    return this.importRows(userId, dataRows);
  }

  async importRows(
    userId: number,
    rawRows: string[][] | Array<Record<string, unknown>>,
  ) {
    const imported: number[] = [];
    const errors: { row: number; reason: string }[] = [];
    let skipped = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const parsed = Array.isArray(raw)
        ? this.fromCsvRow(raw)
        : this.fromJsonRow(raw);

      if (parsed instanceof Error) {
        errors.push({ row: i + 1, reason: parsed.message });
        continue;
      }

      try {
        const signalementId = await this.insertValidated(userId, parsed, i + 1);
        if (signalementId === null) {
          skipped++;
        } else {
          imported.push(signalementId);
        }
      } catch (error) {
        errors.push({
          row: i + 1,
          reason: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    }

    return { imported: imported.length, skipped, errors };
  }

  private fromCsvRow(row: string[]): Record<string, unknown> | Error {
    const [
      maladie,
      region,
      district,
      centre,
      date,
      suspects,
      confirmes,
      deces,
      gueris,
    ] = row;
    if (!maladie || !region || !district || !centre || !date) {
      return new Error(
        'Champs obligatoires manquants (maladie, région, district, centre, date).',
      );
    }
    return {
      maladie,
      region,
      district,
      centre,
      date,
      suspects: Number(suspects ?? 0),
      confirmes: Number(confirmes ?? 0),
      deces: Number(deces ?? 0),
      gueris: Number(gueris ?? 0),
    };
  }

  private fromJsonRow(
    row: Record<string, unknown>,
  ): Record<string, unknown> | Error {
    const {
      maladie,
      region,
      district,
      centre,
      date,
      suspects,
      confirmes,
      deces,
      gueris,
    } = row;
    if (!maladie || !region || !district || !centre || !date) {
      return new Error(
        'Champs obligatoires manquants (maladie, région, district, centre, date).',
      );
    }
    const str = (value: unknown): string =>
      typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
    return {
      maladie: str(maladie),
      region: str(region),
      district: str(district),
      centre: str(centre),
      date: str(date),
      suspects: Number(suspects ?? 0),
      confirmes: Number(confirmes ?? 0),
      deces: Number(deces ?? 0),
      gueris: Number(gueris ?? 0),
    };
  }

  private async insertValidated(
    userId: number,
    data: Record<string, unknown>,
    rowNumber: number,
  ): Promise<number | null> {
    const counts = [
      data.suspects as number,
      data.confirmes as number,
      data.deces as number,
      data.gueris as number,
    ];
    if (counts.some((c) => !Number.isInteger(c) || c < 0)) {
      throw new Error('Les compteurs doivent être des entiers positifs.');
    }
    if ((data.suspects as number) + (data.confirmes as number) === 0) {
      throw new Error('Au moins un cas suspect ou confirmé est requis.');
    }

    const date = new Date(String(data.date));
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Date invalide : ${
          typeof data.date === 'string' ? data.date : JSON.stringify(data.date)
        }`,
      );
    }

    const maladie = await this.prisma.maladie.findFirst({
      where: { name: { equals: String(data.maladie), mode: 'insensitive' } },
    });
    if (!maladie) {
      throw new Error(`Maladie inconnue : ${String(data.maladie)}`);
    }

    const region = await this.prisma.zoneAdministrative.findFirst({
      where: {
        name: { equals: String(data.region), mode: 'insensitive' },
        type: 'Region',
      },
    });
    if (!region) {
      throw new Error(`Région inconnue : ${String(data.region)}`);
    }

    const district = await this.prisma.zoneAdministrative.findFirst({
      where: {
        name: { equals: String(data.district), mode: 'insensitive' },
        type: 'District',
        parentId: region.id,
      },
    });
    if (!district) {
      throw new Error(
        `District inconnu ou hors région : ${String(data.district)} (${region.name})`,
      );
    }

    const centre = await this.prisma.centreSante.findFirst({
      where: {
        name: { equals: String(data.centre), mode: 'insensitive' },
        zoneId: district.id,
      },
    });
    if (!centre) {
      throw new Error(
        `Établissement inconnu ou hors district : ${String(data.centre)} (${district.name})`,
      );
    }

    const duplicate = await this.prisma.signalement.findFirst({
      where: {
        maladieId: maladie.id,
        centreId: centre.id,
        dateSignalement: date,
      },
    });
    if (duplicate) {
      return null; // doublon détecté : ignoré
    }

    const signalement = await this.prisma.signalement.create({
      data: {
        maladieId: maladie.id,
        regionId: region.id,
        districtId: district.id,
        centreId: centre.id,
        dateSignalement: date,
        nbCasSuspects: data.suspects as number,
        nbCasConfirmes: data.confirmes as number,
        nbDeces: data.deces as number,
        nbGueris: data.gueris as number,
        statut: 'EnAttente',
        createdById: userId,
      },
    });

    void rowNumber;
    return signalement.id;
  }

  // ---- Formats ----

  toCsv(dataset: ReportDataset): string {
    const lines: string[] = [];
    lines.push(`Type de rapport;${dataset.meta.type}`);
    lines.push(
      `Période;${dataset.meta.from ?? '—'} → ${dataset.meta.to ?? '—'}`,
    );
    lines.push(
      `Généré le;${dataset.meta.generatedAt};Total;${dataset.totals.total}`,
    );
    lines.push('');
    lines.push('Maladie;Région;Total;Confirmés;Suspects;Actifs;Guéris;Décès');
    for (const row of dataset.matrix ?? []) {
      lines.push(
        `${row.maladie};${row.region};${row.total};${row.confirmed};${row.suspect};${row.active};${row.recovered};${row.deceased}`,
      );
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  toPdf(dataset: ReportDataset): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const meta = dataset.meta;
      doc.fontSize(18).text('Rapport épidémiologique', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .fillColor('#64748b')
        .text(
          `Type : ${meta.type} · Période : ${meta.from ?? '—'} → ${meta.to ?? '—'}`,
          { align: 'center' },
        )
        .fillColor('#0f172a');
      doc.moveDown();

      const totals = dataset.totals;
      doc.fontSize(12).text(`Total de cas : ${totals.total}`);
      doc
        .fontSize(10)
        .text(
          `Confirmés : ${totals.confirmed} · Suspects : ${totals.suspect} · Actifs : ${totals.active} · Guéris : ${totals.recovered} · Décès : ${totals.deceased}`,
        );
      doc
        .fontSize(10)
        .text(
          `Létalité : ${totals.lethalityRate} % · Guérison : ${totals.recoveryRate} %`,
        );
      doc.moveDown();

      doc.fontSize(12).text('Par maladie', { underline: true });
      for (const disease of dataset.byDisease ?? []) {
        doc
          .fontSize(10)
          .text(
            `${disease.maladie} : ${disease.total} cas (confirmés ${disease.confirmed}, décès ${disease.deceased}, guéris ${disease.recovered})`,
          );
      }
      doc.moveDown();

      doc.fontSize(12).text('Par région', { underline: true });
      for (const region of dataset.byRegion ?? []) {
        doc
          .fontSize(10)
          .text(
            `${region.region} : ${region.total} cas (actifs ${region.active}, guéris ${region.recovered}, décès ${region.deceased})`,
          );
      }
      doc.moveDown();

      const sig = dataset.signalements ?? {};
      doc.fontSize(12).text('Signalements', { underline: true });
      doc
        .fontSize(10)
        .text(
          `Total : ${sig.total} · En attente : ${sig.enAttente} · Validés : ${sig.valides} · Rejetés : ${sig.rejetes} · Brouillons : ${sig.brouillons}`,
        );

      doc.moveDown();
      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(`Généré le ${meta.generatedAt}`, { align: 'right' });

      doc.end();
    });
  }
}
