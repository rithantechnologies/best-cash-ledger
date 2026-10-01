-- Allow card swipes to use an exact custom future payment date without a preset payment term.
ALTER TABLE "CardSwipeDetail" ALTER COLUMN "paymentTermId" DROP NOT NULL;
