-- Allow fast expense capture before the payment source is known.
ALTER TABLE "ExpenseDetail"
  ALTER COLUMN "paymentAccountId" DROP NOT NULL,
  ALTER COLUMN "description" DROP NOT NULL;
