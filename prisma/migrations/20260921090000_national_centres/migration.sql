-- Generic categories faithfully reflect the source: Hospital does not establish
-- a CHRD/CHRR/CHU classification, nor Health Centre a CSB1/CSB2 classification.
ALTER TYPE type_centre_enum ADD VALUE IF NOT EXISTS 'CentreSante';
ALTER TYPE type_centre_enum ADD VALUE IF NOT EXISTS 'PosteSante';
ALTER TYPE type_centre_enum ADD VALUE IF NOT EXISTS 'Hopital';
-- Versioned source row IDs distinguish homonyms and make repeat imports safe.
ALTER TABLE centres_sante ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS centres_sante_source_id_key ON centres_sante(source_id);
