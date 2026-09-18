-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('WALK_IN', 'REGULAR');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'UPI', 'PROVIDER_WALLET', 'OWNER_CREDIT_CARD');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('ASSET', 'LIABILITY');

-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('BUSINESS', 'PERSONAL', 'MIXED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CARD_SWIPE', 'CASH_TRANSFER', 'AEPS_WITHDRAWAL', 'CUSTOMER_PAYOUT', 'INTERNAL_TRANSFER', 'BUSINESS_EXPENSE', 'PERSONAL_EXPENSE', 'ATM_WITHDRAWAL', 'OWNER_CC_PAYMENT', 'CASH_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'FAILED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CalculationType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CommissionMethod" AS ENUM ('ADD_ON', 'DEDUCT');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CountType" AS ENUM ('OPENING', 'CLOSING');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCard" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "cardType" TEXT,
    "lastFourDigits" TEXT NOT NULL,
    "nickname" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerBankAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountReference" TEXT NOT NULL,
    "ifsc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUpiAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "upiId" TEXT,
    "mobileNumber" TEXT,
    "providerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerUpiAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "relationshipNote" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryAccount" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "bankName" TEXT,
    "accountReference" TEXT,
    "ifsc" TEXT,
    "upiId" TEXT,
    "mobileNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeneficiaryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderGateway" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "gatewayName" TEXT NOT NULL,
    "gatewayCode" TEXT,
    "defaultChargeType" "CalculationType" NOT NULL,
    "defaultChargeRate" DECIMAL(10,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationValue" INTEGER NOT NULL,
    "durationUnit" TEXT NOT NULL,
    "defaultCommissionType" "CalculationType" NOT NULL,
    "defaultCommissionRate" DECIMAL(10,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "providerId" TEXT,
    "gatewayId" TEXT,
    "paymentTermId" TEXT,
    "transactionType" "TransactionType" NOT NULL,
    "commissionType" "CalculationType" NOT NULL,
    "commissionRate" DECIMAL(10,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "accountNature" "AccountNature" NOT NULL,
    "providerId" TEXT,
    "bankName" TEXT,
    "accountReference" TEXT,
    "lastFourDigits" TEXT,
    "creditLimit" DECIMAL(18,2),
    "usageType" "UsageType" NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expenseUsage" "UsageType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transactionNumber" TEXT NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2),
    "status" "TransactionStatus" NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "reversedTransactionId" TEXT,
    "reversalReason" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCharge" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "providerId" TEXT,
    "gatewayId" TEXT,
    "calculationType" "CalculationType" NOT NULL,
    "rate" DECIMAL(10,4),
    "amount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCommission" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "commissionType" TEXT NOT NULL,
    "calculationType" "CalculationType" NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSwipeDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "customerCardId" TEXT NOT NULL,
    "swipeAmount" DECIMAL(18,2) NOT NULL,
    "providerId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "providerChargeRate" DECIMAL(10,4) NOT NULL,
    "providerChargeAmount" DECIMAL(18,2) NOT NULL,
    "commissionRate" DECIMAL(10,4) NOT NULL,
    "commissionAmount" DECIMAL(18,2) NOT NULL,
    "customerPayableAmount" DECIMAL(18,2) NOT NULL,
    "paymentTermId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "settlementAccountId" TEXT NOT NULL,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardSwipeDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayable" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceTransactionId" TEXT NOT NULL,
    "paymentTermId" TEXT,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(18,2) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "PayableStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayablePayment" (
    "id" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransferDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "beneficiaryAccountId" TEXT,
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "commissionMethod" "CommissionMethod" NOT NULL,
    "commissionRate" DECIMAL(10,4) NOT NULL,
    "commissionAmount" DECIMAL(18,2) NOT NULL,
    "cashReceived" DECIMAL(18,2) NOT NULL,
    "actualTransferAmount" DECIMAL(18,2) NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "transferReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransferDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AepsDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "aadhaarLastFour" TEXT NOT NULL,
    "customerBankName" TEXT NOT NULL,
    "withdrawalAmount" DECIMAL(18,2) NOT NULL,
    "platformId" TEXT,
    "providerId" TEXT,
    "gatewayId" TEXT,
    "platformChargeRate" DECIMAL(10,4),
    "platformChargeAmount" DECIMAL(18,2) NOT NULL,
    "commissionRate" DECIMAL(10,4),
    "commissionAmount" DECIMAL(18,2) NOT NULL,
    "cashGiven" DECIMAL(18,2) NOT NULL,
    "settlementAccountId" TEXT NOT NULL,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AepsDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalTransferDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "transferAmount" DECIMAL(18,2) NOT NULL,
    "chargeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalTransferDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "expenseCategoryId" TEXT NOT NULL,
    "expenseType" "UsageType" NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtmWithdrawalDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "withdrawalAmount" DECIMAL(18,2) NOT NULL,
    "cashReceived" DECIMAL(18,2) NOT NULL,
    "atmCharge" DECIMAL(18,2) NOT NULL,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtmWithdrawalDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardPaymentDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "creditCardAccountId" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "paymentAmount" DECIMAL(18,2) NOT NULL,
    "referenceNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardPaymentDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openingTotal" DECIMAL(18,2) NOT NULL,
    "expectedClosingTotal" DECIMAL(18,2),
    "actualClosingTotal" DECIMAL(18,2),
    "differenceAmount" DECIMAL(18,2),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closingNotes" TEXT,
    "status" "CashSessionStatus" NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDenominationCount" (
    "id" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "countType" "CountType" NOT NULL,
    "denomination" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDenominationCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "ledgerCode" TEXT NOT NULL,
    "ledgerName" TEXT NOT NULL,
    "ledgerType" "LedgerType" NOT NULL,
    "ledgerCategory" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerJournal" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "journalNumber" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "entryType" "EntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "customerId" TEXT,
    "payableId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAccountBalance" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "totalIn" DECIMAL(18,2) NOT NULL,
    "totalOut" DECIMAL(18,2) NOT NULL,
    "closingBalance" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPayableSummary" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "openingPayable" DECIMAL(18,2) NOT NULL,
    "newPayables" DECIMAL(18,2) NOT NULL,
    "paymentsMade" DECIMAL(18,2) NOT NULL,
    "closingPayable" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPayableSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerCode_key" ON "Customer"("customerCode");

-- CreateIndex
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "Customer_mobile_idx" ON "Customer"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_name_key" ON "Provider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderGateway_providerId_gatewayName_key" ON "ProviderGateway"("providerId", "gatewayName");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerm_name_key" ON "PaymentTerm"("name");

-- CreateIndex
CREATE INDEX "CommissionRule_customerId_providerId_gatewayId_paymentTermI_idx" ON "CommissionRule"("customerId", "providerId", "gatewayId", "paymentTermId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_accountCode_key" ON "FinancialAccount"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionNumber_key" ON "Transaction"("transactionNumber");

-- CreateIndex
CREATE INDEX "Transaction_transactionAt_idx" ON "Transaction"("transactionAt");

-- CreateIndex
CREATE INDEX "Transaction_transactionType_transactionAt_idx" ON "Transaction"("transactionType", "transactionAt");

-- CreateIndex
CREATE INDEX "Transaction_customerId_transactionAt_idx" ON "Transaction"("customerId", "transactionAt");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "TransactionCharge_transactionId_idx" ON "TransactionCharge"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionCharge_providerId_idx" ON "TransactionCharge"("providerId");

-- CreateIndex
CREATE INDEX "TransactionCommission_transactionId_idx" ON "TransactionCommission"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CardSwipeDetail_transactionId_key" ON "CardSwipeDetail"("transactionId");

-- CreateIndex
CREATE INDEX "CardSwipeDetail_providerId_gatewayId_idx" ON "CardSwipeDetail"("providerId", "gatewayId");

-- CreateIndex
CREATE INDEX "CardSwipeDetail_dueAt_idx" ON "CardSwipeDetail"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayable_sourceTransactionId_key" ON "CustomerPayable"("sourceTransactionId");

-- CreateIndex
CREATE INDEX "CustomerPayable_customerId_idx" ON "CustomerPayable"("customerId");

-- CreateIndex
CREATE INDEX "CustomerPayable_status_dueAt_idx" ON "CustomerPayable"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayablePayment_transactionId_key" ON "PayablePayment"("transactionId");

-- CreateIndex
CREATE INDEX "PayablePayment_payableId_idx" ON "PayablePayment"("payableId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransferDetail_transactionId_key" ON "CashTransferDetail"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AepsDetail_transactionId_key" ON "AepsDetail"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalTransferDetail_transactionId_key" ON "InternalTransferDetail"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseDetail_transactionId_key" ON "ExpenseDetail"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AtmWithdrawalDetail_transactionId_key" ON "AtmWithdrawalDetail"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardPaymentDetail_transactionId_key" ON "CreditCardPaymentDetail"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CashSession_cashAccountId_businessDate_key" ON "CashSession"("cashAccountId", "businessDate");

-- CreateIndex
CREATE INDEX "CashDenominationCount_cashSessionId_countType_idx" ON "CashDenominationCount"("cashSessionId", "countType");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_ledgerCode_key" ON "LedgerAccount"("ledgerCode");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_financialAccountId_key" ON "LedgerAccount"("financialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerJournal_transactionId_key" ON "LedgerJournal"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerJournal_journalNumber_key" ON "LedgerJournal"("journalNumber");

-- CreateIndex
CREATE INDEX "LedgerJournal_postingDate_idx" ON "LedgerJournal"("postingDate");

-- CreateIndex
CREATE INDEX "LedgerEntry_ledgerAccountId_idx" ON "LedgerEntry"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "LedgerEntry_journalId_idx" ON "LedgerEntry"("journalId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAccountBalance_businessDate_financialAccountId_key" ON "DailyAccountBalance"("businessDate", "financialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPayableSummary_businessDate_key" ON "DailyPayableSummary"("businessDate");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCard" ADD CONSTRAINT "CustomerCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBankAccount" ADD CONSTRAINT "CustomerBankAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUpiAccount" ADD CONSTRAINT "CustomerUpiAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryAccount" ADD CONSTRAINT "BeneficiaryAccount_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderGateway" ADD CONSTRAINT "ProviderGateway_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCharge" ADD CONSTRAINT "TransactionCharge_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCharge" ADD CONSTRAINT "TransactionCharge_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCommission" ADD CONSTRAINT "TransactionCommission_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSwipeDetail" ADD CONSTRAINT "CardSwipeDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSwipeDetail" ADD CONSTRAINT "CardSwipeDetail_customerCardId_fkey" FOREIGN KEY ("customerCardId") REFERENCES "CustomerCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSwipeDetail" ADD CONSTRAINT "CardSwipeDetail_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSwipeDetail" ADD CONSTRAINT "CardSwipeDetail_settlementAccountId_fkey" FOREIGN KEY ("settlementAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayable" ADD CONSTRAINT "CustomerPayable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayable" ADD CONSTRAINT "CustomerPayable_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayable" ADD CONSTRAINT "CustomerPayable_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "CustomerPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransferDetail" ADD CONSTRAINT "CashTransferDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransferDetail" ADD CONSTRAINT "CashTransferDetail_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransferDetail" ADD CONSTRAINT "CashTransferDetail_beneficiaryAccountId_fkey" FOREIGN KEY ("beneficiaryAccountId") REFERENCES "BeneficiaryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransferDetail" ADD CONSTRAINT "CashTransferDetail_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AepsDetail" ADD CONSTRAINT "AepsDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AepsDetail" ADD CONSTRAINT "AepsDetail_settlementAccountId_fkey" FOREIGN KEY ("settlementAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransferDetail" ADD CONSTRAINT "InternalTransferDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransferDetail" ADD CONSTRAINT "InternalTransferDetail_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalTransferDetail" ADD CONSTRAINT "InternalTransferDetail_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDetail" ADD CONSTRAINT "ExpenseDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDetail" ADD CONSTRAINT "ExpenseDetail_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseDetail" ADD CONSTRAINT "ExpenseDetail_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtmWithdrawalDetail" ADD CONSTRAINT "AtmWithdrawalDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtmWithdrawalDetail" ADD CONSTRAINT "AtmWithdrawalDetail_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtmWithdrawalDetail" ADD CONSTRAINT "AtmWithdrawalDetail_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentDetail" ADD CONSTRAINT "CreditCardPaymentDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentDetail" ADD CONSTRAINT "CreditCardPaymentDetail_creditCardAccountId_fkey" FOREIGN KEY ("creditCardAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentDetail" ADD CONSTRAINT "CreditCardPaymentDetail_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDenominationCount" ADD CONSTRAINT "CashDenominationCount_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerJournal" ADD CONSTRAINT "LedgerJournal_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "CustomerPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAccountBalance" ADD CONSTRAINT "DailyAccountBalance_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

