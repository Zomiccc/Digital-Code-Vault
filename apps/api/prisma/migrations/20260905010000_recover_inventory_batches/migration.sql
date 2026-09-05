-- Recover batch metadata for older platform uploads whose batch save failed.
-- Do not mix merchant-owned stock into the admin inventory.
INSERT INTO "CodeBatch" ("id", "denominationId", "quantity", "currency", "createdAt")
SELECT c."batchId", MIN(c."denominationId"), COUNT(*)::integer, 'USD', MIN(c."createdAt")
FROM "CodeItem" c
WHERE c."batchId" IS NOT NULL AND c."source" = 'DCV' AND c."merchantId" IS NULL
GROUP BY c."batchId"
HAVING COUNT(DISTINCT c."denominationId") = 1
ON CONFLICT ("id") DO NOTHING;

UPDATE "CodeBatch" b SET "quantity" = (
  SELECT COUNT(*)::integer FROM "CodeItem" c WHERE c."batchId" = b."id"
);
