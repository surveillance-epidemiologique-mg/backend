-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "type_zone_enum" AS ENUM ('Region', 'District', 'Commune', 'Fokontany');

-- CreateEnum
CREATE TYPE "type_centre_enum" AS ENUM ('CSB1', 'CSB2', 'CHRD', 'CHRR', 'CHU');

-- CreateEnum
CREATE TYPE "statut_diag_enum" AS ENUM ('Suspect', 'Confirme', 'Invalide');

-- CreateEnum
CREATE TYPE "issue_clinique_enum" AS ENUM ('En_cours', 'Gueri', 'Deces', 'Perdu_de_vue');

-- CreateEnum
CREATE TYPE "gravite_enum" AS ENUM ('Faible', 'Modere', 'Eleve', 'Critique');

-- CreateEnum
CREATE TYPE "statut_alerte_enum" AS ENUM ('Active', 'En_investigation', 'Cloturee');

-- CreateTable
CREATE TABLE "alertes" (
    "id_alerte" SERIAL NOT NULL,
    "id_maladie" INTEGER NOT NULL,
    "id_zone" INTEGER NOT NULL,
    "date_detection" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "niveau_gravite" "gravite_enum" NOT NULL DEFAULT 'Modere',
    "statut_alerte" "statut_alerte_enum" NOT NULL DEFAULT 'Active',
    "nombre_cas_detectes" INTEGER NOT NULL,
    "emprise_spatiale" geometry(Polygon, 4326),

    CONSTRAINT "alertes_pkey" PRIMARY KEY ("id_alerte")
);

-- CreateTable
CREATE TABLE "cas_epidemiologiques" (
    "id_cas" SERIAL NOT NULL,
    "id_patient" INTEGER NOT NULL,
    "id_maladie" INTEGER NOT NULL,
    "id_centre" INTEGER NOT NULL,
    "id_agent" INTEGER NOT NULL,
    "id_laboratoire" INTEGER,
    "statut_diagnostic" "statut_diag_enum" NOT NULL DEFAULT 'Suspect',
    "issue_clinique" "issue_clinique_enum" NOT NULL DEFAULT 'En_cours',
    "resultat_labo" TEXT,
    "date_diagnostic" DATE NOT NULL,
    "date_analyse" TIMESTAMP(3),
    "date_issue" DATE,
    "date_declaration" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symptomes" TEXT,
    "localisation_cas" geometry(Point, 4326),

    CONSTRAINT "cas_epidemiologiques_pkey" PRIMARY KEY ("id_cas")
);

-- CreateTable
CREATE TABLE "centres_sante" (
    "id_centre" SERIAL NOT NULL,
    "nom_centre" VARCHAR(150) NOT NULL,
    "type_centre" "type_centre_enum" NOT NULL,
    "id_zone" INTEGER NOT NULL,
    "localisation" geometry(Point, 4326),

    CONSTRAINT "centres_sante_pkey" PRIMARY KEY ("id_centre")
);

-- CreateTable
CREATE TABLE "maladies" (
    "id_maladie" SERIAL NOT NULL,
    "nom_maladie" VARCHAR(100) NOT NULL,
    "code_icd10" VARCHAR(20),
    "seuil_alerte" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,

    CONSTRAINT "maladies_pkey" PRIMARY KEY ("id_maladie")
);

-- CreateTable
CREATE TABLE "patients" (
    "id_patient" SERIAL NOT NULL,
    "code_anonyme" VARCHAR(50) NOT NULL,
    "age" INTEGER,
    "sexe" CHAR(1),
    "id_zone_residence" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id_patient")
);

-- CreateTable
CREATE TABLE "roles" (
    "id_role" SERIAL NOT NULL,
    "nom_role" VARCHAR(50) NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id_role")
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id_utilisateur" SERIAL NOT NULL,
    "nom" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(30),
    "mot_de_passe_hash" VARCHAR(255) NOT NULL,
    "mot_de_passe_temporaire" BOOLEAN NOT NULL DEFAULT true,
    "token_reinitialisation" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "id_role" INTEGER NOT NULL,
    "id_centre" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id_utilisateur")
);

-- CreateTable
CREATE TABLE "zones_administratives" (
    "id_zone" SERIAL NOT NULL,
    "nom_zone" VARCHAR(100) NOT NULL,
    "type_zone" "type_zone_enum" NOT NULL,
    "code_pcode" VARCHAR(20),
    "id_zone_parent" INTEGER,
    "geometrie" geometry(MultiPolygon, 4326),

    CONSTRAINT "zones_administratives_pkey" PRIMARY KEY ("id_zone")
);

-- CreateIndex
CREATE INDEX "idx_cas_dates" ON "cas_epidemiologiques"("date_diagnostic");

-- CreateIndex
CREATE INDEX "idx_cas_diag_issue" ON "cas_epidemiologiques"("statut_diagnostic", "issue_clinique");

-- CreateIndex
CREATE UNIQUE INDEX "maladies_code_icd10_key" ON "maladies"("code_icd10");

-- CreateIndex
CREATE UNIQUE INDEX "patients_code_anonyme_key" ON "patients"("code_anonyme");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nom_role_key" ON "roles"("nom_role");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_token_reinitialisation_key" ON "utilisateurs"("token_reinitialisation");

-- CreateIndex
CREATE UNIQUE INDEX "zones_administratives_code_pcode_key" ON "zones_administratives"("code_pcode");

-- AddForeignKey
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_id_maladie_fkey" FOREIGN KEY ("id_maladie") REFERENCES "maladies"("id_maladie") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_id_zone_fkey" FOREIGN KEY ("id_zone") REFERENCES "zones_administratives"("id_zone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cas_epidemiologiques" ADD CONSTRAINT "cas_epidemiologiques_id_patient_fkey" FOREIGN KEY ("id_patient") REFERENCES "patients"("id_patient") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cas_epidemiologiques" ADD CONSTRAINT "cas_epidemiologiques_id_maladie_fkey" FOREIGN KEY ("id_maladie") REFERENCES "maladies"("id_maladie") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cas_epidemiologiques" ADD CONSTRAINT "cas_epidemiologiques_id_centre_fkey" FOREIGN KEY ("id_centre") REFERENCES "centres_sante"("id_centre") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cas_epidemiologiques" ADD CONSTRAINT "cas_epidemiologiques_id_agent_fkey" FOREIGN KEY ("id_agent") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cas_epidemiologiques" ADD CONSTRAINT "cas_epidemiologiques_id_laboratoire_fkey" FOREIGN KEY ("id_laboratoire") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centres_sante" ADD CONSTRAINT "centres_sante_id_zone_fkey" FOREIGN KEY ("id_zone") REFERENCES "zones_administratives"("id_zone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_id_zone_residence_fkey" FOREIGN KEY ("id_zone_residence") REFERENCES "zones_administratives"("id_zone") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_id_role_fkey" FOREIGN KEY ("id_role") REFERENCES "roles"("id_role") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_id_centre_fkey" FOREIGN KEY ("id_centre") REFERENCES "centres_sante"("id_centre") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones_administratives" ADD CONSTRAINT "zones_administratives_id_zone_parent_fkey" FOREIGN KEY ("id_zone_parent") REFERENCES "zones_administratives"("id_zone") ON DELETE SET NULL ON UPDATE CASCADE;
