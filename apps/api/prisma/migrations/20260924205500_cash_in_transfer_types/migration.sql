CREATE TABLE "CashInTransferType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "transferMode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashInTransferType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashInTransferType_name_key"
ON "CashInTransferType"("name");

INSERT INTO "CashInTransferType"
  ("id","name","transferMode","isActive","createdAt","updatedAt")
VALUES
  ('d3c7b7df-7985-4eb2-a1e1-f99d3d0799d5','GPay / UPI Transfer','UPI',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('fce9a144-3922-4f0d-9627-054fd2a8d20c','Bank Transfer','BANK',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
