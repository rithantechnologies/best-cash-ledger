from pathlib import Path

path = Path("/var/www/cashledger/apps/api/prisma/schema.prisma")
s = path.read_text()

def rep(old, new):
    global s
    if old not in s:
        raise SystemExit("Missing schema marker: " + old[:80])
    s = s.replace(old, new, 1)

rep("""  CUSTOMER_PAYOUT
  INTERNAL_TRANSFER""", """  CUSTOMER_PAYOUT
  CUSTOMER_RECEIVABLE
  CUSTOMER_RECEIPT
  INTERNAL_TRANSFER""")

rep("""enum PayableStatus {
  PENDING
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
  REVERSED
}

enum PaymentStatus""", """enum PayableStatus {
  PENDING
  PARTIALLY_PAID
  PAID
  OVERDUE
  CANCELLED
  REVERSED
}

enum ReceivableStatus {
  PENDING
  PARTIALLY_RECEIVED
  RECEIVED
  OVERDUE
  CANCELLED
  REVERSED
}

enum PaymentStatus""")
rep("""  INCOME
  EXPENSE
}""", """  INCOME
  EXPENSE
  EQUITY
}""")
rep("""  payables      CustomerPayable[]
  ledgerEntries LedgerEntry[]""", """  payables      CustomerPayable[]
  receivables   CustomerReceivable[]
  ledgerEntries LedgerEntry[]""")
rep("""  payablePayments            PayablePayment[]
  cashTransfersOut""", """  payablePayments            PayablePayment[]
  receivableSources           CustomerReceivable[]     @relation("ReceivableSourceAccount")
  receivableCollections       ReceivableCollection[]   @relation("ReceivableCollectionAccount")
  cashTransfersOut""")
rep("""  payable               CustomerPayable?
  payablePayment        PayablePayment?
  journal""", """  payable               CustomerPayable?
  payablePayment        PayablePayment?
  receivableSource      CustomerReceivable?   @relation("ReceivableSourceTransaction")
  receivableCollection  ReceivableCollection? @relation("ReceivableCollectionTransaction")
  journal""")
rep("""model CashTransferDetail {""", """model CustomerReceivable {
  id                  String            @id @default(uuid())
  customerId          String
  customer            Customer          @relation(fields: [customerId], references: [id])
  sourceTransactionId String            @unique
  sourceTransaction   Transaction       @relation("ReceivableSourceTransaction", fields: [sourceTransactionId], references: [id])
  sourceAccountId     String?
  sourceAccount       FinancialAccount? @relation("ReceivableSourceAccount", fields: [sourceAccountId], references: [id])
  reason              String
  description         String?
  originalAmount      Decimal           @db.Decimal(18, 2)
  receivedAmount      Decimal           @default(0) @db.Decimal(18, 2)
  remainingAmount     Decimal           @db.Decimal(18, 2)
  dueAt               DateTime?
  status              ReceivableStatus
  collections         ReceivableCollection[]
  ledgerEntries       LedgerEntry[]
  createdById         String
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  @@index([customerId])
  @@index([status, dueAt])
}

model ReceivableCollection {
  id                   String           @id @default(uuid())
  receivableId         String
  receivable           CustomerReceivable @relation(fields: [receivableId], references: [id])
  transactionId        String           @unique
  transaction          Transaction      @relation("ReceivableCollectionTransaction", fields: [transactionId], references: [id])
  collectionDate       DateTime
  destinationAccountId String
  destinationAccount   FinancialAccount @relation("ReceivableCollectionAccount", fields: [destinationAccountId], references: [id])
  amount               Decimal          @db.Decimal(18, 2)
  referenceNumber      String?
  notes                String?
  status               PaymentStatus
  createdById          String
  createdAt            DateTime         @default(now())

  @@index([receivableId])
  @@index([destinationAccountId])
}

model CashTransferDetail {""")
rep("""  payableId       String?
  payable         CustomerPayable? @relation(fields: [payableId], references: [id])
  description""", """  payableId       String?
  payable         CustomerPayable? @relation(fields: [payableId], references: [id])
  receivableId    String?
  receivable      CustomerReceivable? @relation(fields: [receivableId], references: [id])
  description""")

path.write_text(s)
print("schema patched")
