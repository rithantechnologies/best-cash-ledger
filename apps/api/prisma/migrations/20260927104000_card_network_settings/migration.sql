CREATE TABLE "CardNetwork" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CardNetwork_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CardNetwork_name_key" ON "CardNetwork"("name");

INSERT INTO "CardNetwork" ("id","name","isActive","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'RuPay',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Visa',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Mastercard',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'American Express',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Diners Club',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Discover',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'JCB',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'UnionPay',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid()::text,'Maestro',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
