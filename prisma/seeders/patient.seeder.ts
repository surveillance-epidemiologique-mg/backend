import { Prisma } from "../../generated/prisma/client";

interface PatientSeed {
  anonymousCode: string;
  age: number;
  gender: string;
}

const PATIENTS: PatientSeed[] = [
  { anonymousCode: "PAT-0001", age: 34, gender: "M" },
  { anonymousCode: "PAT-0002", age: 28, gender: "F" },
  { anonymousCode: "PAT-0003", age: 52, gender: "M" },
  { anonymousCode: "PAT-0004", age: 9, gender: "F" },
  { anonymousCode: "PAT-0005", age: 41, gender: "M" },
  { anonymousCode: "PAT-0006", age: 23, gender: "F" },
  { anonymousCode: "PAT-0007", age: 67, gender: "M" },
  { anonymousCode: "PAT-0008", age: 31, gender: "F" },
  { anonymousCode: "PAT-0009", age: 45, gender: "M" },
  { anonymousCode: "PAT-0010", age: 17, gender: "F" },
  { anonymousCode: "PAT-0011", age: 39, gender: "M" },
  { anonymousCode: "PAT-0012", age: 55, gender: "F" },
  { anonymousCode: "PAT-0013", age: 26, gender: "M" },
  { anonymousCode: "PAT-0014", age: 48, gender: "F" },
];

export async function seedPatients(prisma: Prisma.TransactionClient) {
  const zone = await prisma.zoneAdministrative.findFirst({
    orderBy: { id: "asc" },
  });

  for (const patient of PATIENTS) {
    await prisma.patient.upsert({
      where: { anonymousCode: patient.anonymousCode },
      update: {
        age: patient.age,
        gender: patient.gender,
        residenceZoneId: zone?.id,
      },
      create: {
        ...patient,
        residenceZoneId: zone?.id,
      },
    });
  }
}