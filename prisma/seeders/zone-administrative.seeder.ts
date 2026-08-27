import { Prisma } from "../../generated/prisma/client";
import { TypeZone } from "../../generated/prisma/enums";

interface ZoneSeed {
  name: string;
  pcode: string;
  type: TypeZone;
  parentPcode?: string;
}

const ZONES: ZoneSeed[] = [
  // 22 régions de Madagascar (noms alignés sur le GeoJSON)
  { name: "Analamanga", pcode: "MG-T", type: TypeZone.Region },
  { name: "Atsinanana", pcode: "MG-A", type: TypeZone.Region },
  { name: "Diana", pcode: "MG-D", type: TypeZone.Region },
  { name: "Sava", pcode: "MG-SV", type: TypeZone.Region },
  { name: "Sofia", pcode: "MG-SO", type: TypeZone.Region },
  { name: "Boeny", pcode: "MG-B", type: TypeZone.Region },
  { name: "Betsiboka", pcode: "MG-BE", type: TypeZone.Region },
  { name: "Melaky", pcode: "MG-ML", type: TypeZone.Region },
  { name: "Bongolava", pcode: "MG-BG", type: TypeZone.Region },
  { name: "Itasy", pcode: "MG-IT", type: TypeZone.Region },
  { name: "Vakinankaratra", pcode: "MG-VK", type: TypeZone.Region },
  { name: "Alaotra-Mangoro", pcode: "MG-AM", type: TypeZone.Region },
  { name: "Analanjirofo", pcode: "MG-AF", type: TypeZone.Region },
  { name: "Menabe", pcode: "MG-MN", type: TypeZone.Region },
  { name: "Amoron'i Mania", pcode: "MG-MM", type: TypeZone.Region },
  { name: "Haute Matsiatra", pcode: "MG-HM", type: TypeZone.Region },
  { name: "Vatovavy-Fitovinany", pcode: "MG-VF", type: TypeZone.Region },
  { name: "Atsimo-Atsinanana", pcode: "MG-AA", type: TypeZone.Region },
  { name: "Ihorombe", pcode: "MG-IH", type: TypeZone.Region },
  { name: "Atsimo-Andrefana", pcode: "MG-AT", type: TypeZone.Region },
  { name: "Anosy", pcode: "MG-AN", type: TypeZone.Region },
  { name: "Androy", pcode: "MG-AD", type: TypeZone.Region },
  // Districts (pour la localisation des établissements)
  { name: "Antananarivo Renivohitra", pcode: "MG-T1", type: TypeZone.District, parentPcode: "MG-T" },
  { name: "Toamasina I", pcode: "MG-A1", type: TypeZone.District, parentPcode: "MG-A" },
  { name: "Antsiranana I", pcode: "MG-D1", type: TypeZone.District, parentPcode: "MG-D" },
  { name: "Mahajanga I", pcode: "MG-B1", type: TypeZone.District, parentPcode: "MG-B" },
  { name: "Fianarantsoa I", pcode: "MG-HM1", type: TypeZone.District, parentPcode: "MG-HM" },
  { name: "Toliara I", pcode: "MG-AT1", type: TypeZone.District, parentPcode: "MG-AT" },
  { name: "Antsirabe I", pcode: "MG-VK1", type: TypeZone.District, parentPcode: "MG-VK" },
  { name: "Vangaindrano", pcode: "MG-AA1", type: TypeZone.District, parentPcode: "MG-AA" },
  { name: "Taolagnaro", pcode: "MG-AN1", type: TypeZone.District, parentPcode: "MG-AN" },
  { name: "Morondava", pcode: "MG-MN1", type: TypeZone.District, parentPcode: "MG-MN" },
  { name: "Antalaha", pcode: "MG-SV1", type: TypeZone.District, parentPcode: "MG-SV" },
  { name: "Tsiroanomandidy", pcode: "MG-BG1", type: TypeZone.District, parentPcode: "MG-BG" },
  { name: "1er Arrondissement", pcode: "MG-T1-01", type: TypeZone.Commune, parentPcode: "MG-T1" },
];

export async function seedZonesAdministratives(prisma: Prisma.TransactionClient) {
  const byPcode = new Map<string, string>();
  for (const zone of ZONES) {
    let parentId: number | null = null;
    if (zone.parentPcode) {
      const parent = await prisma.zoneAdministrative.findUnique({
        where: { pcode: zone.parentPcode },
      });
      parentId = parent?.id ?? null;
    }

    const record = await prisma.zoneAdministrative.upsert({
      where: { pcode: zone.pcode },
      update: { name: zone.name, type: zone.type, parentId },
      create: { name: zone.name, type: zone.type, pcode: zone.pcode, parentId },
    });
    byPcode.set(zone.pcode, String(record.id));
  }
}