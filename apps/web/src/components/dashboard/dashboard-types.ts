export type FinancialContext = "ALL" | "BUSINESS" | "PERSONAL";

export type DashboardPeriod =
  | "TODAY"
  | "7D"
  | "30D"
  | "THIS_MONTH"
  | "PREVIOUS_MONTH";

export type Breakdown = {
  pendingAmount?: number;
  pendingCount?: number;
  partialAmount?: number;
  partialCount?: number;
  dueTodayAmount: number;
  dueTodayCount: number;
  overdueAmount: number;
  overdueCount: number;
};

export type DashboardSummary = {
  cashBalance: number;
  bankBalance: number;
  upiBalance: number;
  walletBalance: number;
  availableFunds: number;
  currentAvailability: number;
  customerPayable: number;
  customerReceivable: number;
  pendingProviderSettlements: number;
  pendingProviderSettlementCount: number;
  operatingPosition: number;
  netFinancialPosition: number;
  creditCardOutstanding: number;
  creditCardAvailable: number;
  payableBreakdown: Breakdown;
  receivableBreakdown: Breakdown;
};

export type DashboardAccount = {
  id: string;
  accountName: string;
  accountType: string;
  accountNature: string;
  currentBalance: number;
  isActive: boolean;
  usageType: "BUSINESS" | "PERSONAL" | "MIXED";
  bankName?: string | null;
  lastFourDigits?: string | null;
  providerId?: string | null;
  creditLimit?: number | null;
  availableCredit?: number | null;
};

export type DashboardToday = {
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  walletIn: number;
  walletOut: number;
  upiIn: number;
  upiOut: number;
  cardSwipe: number;
  cashTransfer: number;
  aeps: number;
  microAtm: number;
  customerPayout: number;
  customerReceipt: number;
  receivableCreated: number;
  settlementsReceived: number;
  commission: number;
  cardSwipeCommission: number;
  cashTransferCommission: number;
  aepsCommission: number;
  microAtmCommission: number;
  providerCharges: number;
  businessExpense: number;
  personalExpense: number;
};

export type DueRecord = {
  id: string;
  remainingAmount: string;
  originalAmount?: string;
  dueAt: string | null;
  bucket: "OVERDUE" | "PARTIAL" | "UPCOMING";
  customer: { fullName: string };
};

export type AgingBucket = {
  label: string;
  amount: number;
  count: number;
};

export type ObligationInsights = {
  receivables: AgingBucket[];
  payables: AgingBucket[];
};

export type PositionTrendPoint = {
  date: string;
  availableFunds: number;
  pendingProviderSettlements: number;
  receivables: number;
  payables: number;
  creditCardOutstanding: number;
  operatingPosition: number;
  netPosition: number;
  capturedAt: string;
};

export type ExpenseRecord = {
  id: string;
  transactionNumber: string;
  transactionAt: string;
  amount: number;
  status: string;
  referenceNumber: string | null;
  notes: string | null;
  description: string;
  expenseType: "BUSINESS" | "PERSONAL";
  category: { id: string; name: string };
  account: { id: string; accountName: string; accountType: string };
};

export type CashFlowPoint = {
  date: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
};

export type FlowMovement = {
  id: string;
  date: string;
  direction: "IN" | "OUT";
  amount: number;
  description: string | null;
  account: {
    id: string;
    accountName: string;
    accountType: string;
    usageType: "BUSINESS" | "PERSONAL" | "MIXED";
  };
  transaction: {
    id: string;
    transactionNumber: string;
    transactionType: string;
    status: string;
    referenceNumber: string | null;
    customer: { fullName: string } | null;
  };
};

export type IncomeRecord = {
  id: string;
  transactionNumber: string;
  transactionType: string;
  transactionAt: string;
  status: string;
  customer: { fullName: string } | null;
  amount: number;
  description: string | null;
};

export type RecentRecord = {
  id: string;
  transactionNumber: string;
  transactionType: string;
  transactionAt: string;
  grossAmount: string;
  netAmount: string | null;
  status: string;
  referenceNumber: string | null;
  context: "BUSINESS" | "PERSONAL" | "MIXED";
  customer: { fullName: string } | null;
  expense: {
    description: string;
    expenseType: "BUSINESS" | "PERSONAL";
    expenseCategory: { name: string };
  } | null;
};

export type DashboardAnalytics = {
  range: { from: string; to: string; scope: FinancialContext };
  expenses: {
    total: number;
    businessTotal: number;
    personalTotal: number;
    previousTotal: number;
    transactions: ExpenseRecord[];
  };
  cashFlow: {
    series: CashFlowPoint[];
    movements: FlowMovement[];
    moneyIn: number;
    moneyOut: number;
    net: number;
  };
  income: {
    total: number;
    transactions: IncomeRecord[];
  };
  recent: RecentRecord[];
};

export type DashboardCore = {
  summary: DashboardSummary;
  accounts: DashboardAccount[];
  today: DashboardToday;
  payables: DueRecord[];
  receivables: DueRecord[];
  obligations: ObligationInsights;
  positionTrend: PositionTrendPoint[];
};

export type ExpenseCategoryGroup = {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  transactions: ExpenseRecord[];
  color: string;
};
