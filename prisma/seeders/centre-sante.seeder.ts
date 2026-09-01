import { Prisma } from "../../generated/prisma/client";
import { TypeCentre } from "../../generated/prisma/enums";

interface CentreSeed {
  name: string;
  type: TypeCentre;
  districtPcode: string;
  latitude: number;
  longitude: number;
}

const CENTRES: CentreSeed[] = [
  { name: "CSB2 Ambohidratrimo", type: TypeCentre.CSB2, districtPcode: "MG-T1", latitude: -18.83, longitude: 47.5 },
  { name: "CHRD Toamasina", type: TypeCentre.CHRD, districtPcode: "MG-A1", latitude: -18.15, longitude: 49.4 },
  { name: "CHU Androva Mahajanga", type: TypeCentre.CHU, districtPcode: "MG-B1", latitude: -15.71, longitude: 46.32 },
  { name: "CHU Joseph Ravoahangy Andrianavalona", type: TypeCentre.CHU, districtPcode: "MG-T1", latitude: -18.91, longitude: 47.53 },
  { name: "CHRR Fianarantsoa", type: TypeCentre.CHRR, districtPcode: "MG-HM1", latitude: -21.45, longitude: 47.09 },
  { name: "CHRR Antsiranana", type: TypeCentre.CHRR, districtPcode: "MG-D1", latitude: -12.27, longitude: 49.3 },
  { name: "CHU Toliara", type: TypeCentre.CHU, districtPcode: "MG-AT1", latitude: -23.35, longitude: 43.67 },
  { name: "CHRR Antsirabe", type: TypeCentre.CHRR, districtPcode: "MG-VK1", latitude: -19.87, longitude: 47.03 },
  { name: "CSB2 Vangaindrano", type: TypeCentre.CSB2, districtPcode: "MG-AA1", latitude: -23.35, longitude: 47.6 },
  { name: "CHRD Taolagnaro", type: TypeCentre.CHRD, districtPcode: "MG-AN1", latitude: -25.03, longitude: 46.99 },
  { name: "CHRD Morondava", type: TypeCentre.CHRD, districtPcode: "MG-MN1", latitude: -20.28, longitude: 44.28 },
  { name: "CSB1 Antalaha", type: TypeCentre.CSB1, districtPcode: "MG-SV1", latitude: -15.36, longitude: 50.28 },
  { name: "CHRR Tsiroanomandidy", type: TypeCentre.CHRR, districtPcode: "MG-BG1", latitude: -18.77, longitude: 46.05 },
];

export async function seedCentresSante(prisma: Prisma.TransactionClient) {
  for (const centre of CENTRES) {
    const district = await prisma.zoneAdministrative.findUnique({
      where: { pcode: centre.districtPcode },
    });

    if (!district) {
      throw new Error(
        `Zone '${centre.districtPcode}' introuvable. Exécutez d'abord seedZonesAdministratives.`,
      );
    }

    const data = {
      name: centre.name,
      type: centre.type,
      zoneId: district.id,
      latitude: centre.latitude,
      longitude: centre.longitude,
    };

    const existing = await prisma.centreSante.findFirst({
      where: { name: centre.name },
    });

    let saved;
    if (existing) {
      saved = await prisma.centreSante.update({
        where: { id: existing.id },
        data,
      });
    } else {
      saved = await prisma.centreSante.create({ data });
    }

    await prisma.$executeRaw`
      UPDATE centres_sante
      SET localisation = ST_SetSRID(ST_MakePoint(${centre.longitude}, ${centre.latitude}), 4326)
      WHERE id_centre = ${saved.id}
    `;
  }
}