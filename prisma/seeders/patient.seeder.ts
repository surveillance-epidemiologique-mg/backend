import { Prisma } from "../../generated/prisma/client";

interface PatientSeed {
  anonymousCode: string;
  namePatient: string;
  age: number;
  gender: string;
}

const PATIENTS: PatientSeed[] = [
  { anonymousCode: "PAT-0001", namePatient: "Patient 01", age: 34, gender: "M" },
  { anonymousCode: "PAT-0002", namePatient: "Patient 02", age: 28, gender: "F" },
  { anonymousCode: "PAT-0003", namePatient: "Patient 03", age: 52, gender: "M" },
  { anonymousCode: "PAT-0004", namePatient: "Patient 04", age: 9, gender: "F" },
  { anonymousCode: "PAT-0005", namePatient: "Patient 05", age: 41, gender: "M" },
  { anonymousCode: "PAT-0006", namePatient: "Patient 06", age: 23, gender: "F" },
  { anonymousCode: "PAT-0007", namePatient: "Patient 07", age: 67, gender: "M" },
  { anonymousCode: "PAT-0008", namePatient: "Patient 08", age: 31, gender: "F" },
  { anonymousCode: "PAT-0009", namePatient: "Patient 09", age: 45, gender: "M" },
  { anonymousCode: "PAT-0010", namePatient: "Patient 10", age: 17, gender: "F" },
  { anonymousCode: "PAT-0011", namePatient: "Patient 11", age: 39, gender: "M" },
  { anonymousCode: "PAT-0012", namePatient: "Patient 12", age: 55, gender: "F" },
  { anonymousCode: "PAT-0013", namePatient: "Patient 13", age: 26, gender: "M" },
  { anonymousCode: "PAT-0014", namePatient: "Patient 14", age: 48, gender: "F" },
];

export async function seedPatients(prisma: Prisma.TransactionClient) {
  const zone = await prisma.zoneAdministrative.findFirst({
    orderBy: { id: "asc" },
  });

  for (const patient of PATIENTS) {
    await prisma.patient.upsert({
      where: { anonymousCode: patient.anonymousCode },
      update: {
        namePatient: patient.namePatient,
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