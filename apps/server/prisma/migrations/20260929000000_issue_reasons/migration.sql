-- Reason codes for the ISSUE movement type (added in 20260928000000_stock_positions).
-- Fresh databases get these from the seed; this brings an already-seeded database in line.

UPDATE "reason_codes"
SET "applies_to" = array_append("applies_to", 'ISSUE'::"MovementType")
WHERE "code" = 'SAMPLE' AND NOT ('ISSUE'::"MovementType" = ANY ("applies_to"));

INSERT INTO "reason_codes" ("id", "code", "label", "direction", "applies_to", "sort_order")
SELECT gen_random_uuid(), 'INTERNAL_USE', 'Internal use (store, office, canteen)', 'OUT', ARRAY['ISSUE'::"MovementType"],
       (SELECT COALESCE(MAX("sort_order"), 0) + 1 FROM "reason_codes")
WHERE EXISTS (SELECT 1 FROM "reason_codes")
ON CONFLICT ("code") DO NOTHING;
