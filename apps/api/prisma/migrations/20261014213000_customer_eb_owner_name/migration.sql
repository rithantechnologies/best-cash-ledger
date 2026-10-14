-- Store the named owner of each saved electricity connection independently from its nickname.
ALTER TABLE "CustomerServiceProfile" ADD COLUMN "ownerName" TEXT;
