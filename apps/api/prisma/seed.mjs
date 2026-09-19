import bcrypt from 'bcrypt';
import { LedgerType, PrismaClient, RoleName } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const roles = {};
  for (const name of [RoleName.OWNER, RoleName.ADMIN, RoleName.STAFF]) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_TEMP_PASSWORD;

  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash, roleId: roles[RoleName.OWNER].id, isActive: true },
      create: {
        fullName: 'Owner',
        email,
        passwordHash,
        roleId: roles[RoleName.OWNER].id,
        isActive: true,
      },
    });
  }
  const systemLedgers = [
    ['SYS-CUST-PAYABLE', 'Customer Payables', LedgerType.LIABILITY, 'CUSTOMER_PAYABLE'],
    ['SYS-CUST-RECEIVABLE', 'Customer Receivables', LedgerType.ASSET, 'CUSTOMER_RECEIVABLE'],
    ['SYS-RECEIVABLE-ADJUSTMENT', 'Receivable Opening Adjustments', LedgerType.EQUITY, 'RECEIVABLE_ADJUSTMENT'],
    ['SYS-COMMISSION', 'Commission Income', LedgerType.INCOME, 'COMMISSION_INCOME'],
    ['SYS-PROVIDER-CHARGE', 'Provider Charges', LedgerType.EXPENSE, 'PROVIDER_CHARGE'],
    ['SYS-BANK-CHARGE', 'Bank Charges', LedgerType.EXPENSE, 'BANK_CHARGE'],
    ['SYS-ATM-CHARGE', 'ATM Charges', LedgerType.EXPENSE, 'ATM_CHARGE'],
    ['SYS-BUSINESS-EXPENSE', 'Business Expenses', LedgerType.EXPENSE, 'BUSINESS_EXPENSE'],
    ['SYS-PERSONAL-EXPENSE', 'Personal Expenses', LedgerType.EXPENSE, 'PERSONAL_EXPENSE'],
  ];

  for (const [ledgerCode, ledgerName, ledgerType, ledgerCategory] of systemLedgers) {
    await prisma.ledgerAccount.upsert({
      where: { ledgerCode },
      update: {},
      create: { ledgerCode, ledgerName, ledgerType, ledgerCategory },
    });
  }

  const paymentTerms = [
    ['Instant', 0, 'HOURS'],
    ['24 Hours', 24, 'HOURS'],
    ['3 Days', 3, 'DAYS'],
    ['7 Days', 7, 'DAYS'],
    ['20 Days', 20, 'DAYS'],
    ['22 Days', 22, 'DAYS'],
  ];

  for (const [name, durationValue, durationUnit] of paymentTerms) {
    await prisma.paymentTerm.upsert({
      where: { name },
      update: {},
      create: {
        name,
        durationValue,
        durationUnit,
        defaultCommissionType: 'PERCENTAGE',
        defaultCommissionRate: 0,
      },
    });
  }

  const expenseCategories = [
    ['Bank Charges', 'BUSINESS'],
    ['Fuel', 'MIXED'],
    ['Office Expense', 'BUSINESS'],
    ['Rent', 'BUSINESS'],
    ['Staff Expense', 'BUSINESS'],
    ['Personal Expense', 'PERSONAL'],
    ['Other', 'MIXED'],
  ];

  for (const [name, expenseUsage] of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name, expenseUsage },
    });
  }

  console.log('Base roles, owner, ledgers and settings seeded.');
} finally {
  await prisma.$disconnect();
}
