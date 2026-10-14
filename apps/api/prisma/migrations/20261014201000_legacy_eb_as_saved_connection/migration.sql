-- Preserve existing primary EB numbers as reusable, independently editable connections.
INSERT INTO "CustomerServiceProfile" ("id", "customerId", "serviceName", "nickname", "referenceNumber", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", 'Eb Bill', 'EB connection', c."ebNumber", true, NOW(), NOW()
FROM "Customer" c
WHERE c."ebNumber" IS NOT NULL AND BTRIM(c."ebNumber") <> ''
ON CONFLICT ("customerId", "serviceName", "referenceNumber") DO NOTHING;
