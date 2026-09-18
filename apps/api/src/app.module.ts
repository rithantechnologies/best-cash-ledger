import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { ProvidersModule } from './providers/providers.module.js';
import { PayablesModule } from './payables/payables.module.js';
import { ReceivablesModule } from './receivables/receivables.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { CashCounterModule } from './cash-counter/cash-counter.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { AuditModule } from './audit/audit.module.js';
import { SearchModule } from './search/search.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { ProviderSettlementsModule } from './provider-settlements/provider-settlements.module.js';
import { EndOfDayModule } from './end-of-day/end-of-day.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    FinanceModule,
    HealthModule,
    CustomersModule,
    AccountsModule,
    ProvidersModule,
    PayablesModule,
    ReceivablesModule,
    ProviderSettlementsModule,
    EndOfDayModule,
    LedgerModule,
    TransactionsModule,
    AuthModule,
    UsersModule,
    DashboardModule,
    SettingsModule,
    CashCounterModule,
    ReportsModule,
    AuditModule,
    SearchModule,
  ],
})
export class AppModule {}
