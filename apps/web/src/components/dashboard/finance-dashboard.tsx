"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import { formatMoney, titleCase } from "@/lib/format";
import { CashFlowChart, ExpenseDonut, FundsAllocationDonut, PositionSparkline } from "./dashboard-charts";
import { DashboardIcon, type DashboardIconName } from "./dashboard-icons";
import type {
  CashFlowPoint,
  DashboardAnalytics,
  DashboardCore,
  DashboardPeriod,
  DueRecord,
  ExpenseCategoryGroup,
  ExpenseRecord,
  FinancialContext,
  FlowMovement,
  IncomeRecord,
  PositionTrendPoint,
  RecentRecord,
} from "./dashboard-types";
import styles from "./finance-dashboard.module.css";

const categoryPalette = [
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#1d4ed8",
  "#1e40af",
  "#64748b",
  "#94a3b8",
];

const money = (value: number | string, digits = 0) =>
  formatMoney(value, { decimals: digits === 0 ? 0 : 2 });

const compactMoney = (value: number) =>
  formatMoney(value, { decimals: 0, compact: true });

const shortDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "No due date";

const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function periodRange(period: DashboardPeriod) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  let start = new Date(today);
  let end = new Date(tomorrow);
  let label = "Today";

  if (period === "7D") {
    start.setDate(start.getDate() - 6);
    label = "Last 7 days";
  } else if (period === "30D") {
    start.setDate(start.getDate() - 29);
    label = "Last 30 days";
  } else if (period === "THIS_MONTH") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    label = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  } else if (period === "PREVIOUS_MONTH") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 1);
    label = start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }

  return { from: start.toISOString(), to: end.toISOString(), label };
}

function accountIcon(accountType: string): DashboardIconName {
  if (accountType === "CASH") return "cash";
  if (accountType === "UPI") return "upi";
  if (accountType === "PROVIDER_WALLET") return "wallet";
  if (accountType === "OWNER_CREDIT_CARD") return "card";
  return "bank";
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p className={styles.sectionDescription}>{description}</p> : null}
      </div>
      {action ? <div className={styles.sectionAction}>{action}</div> : null}
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.textLink}>
      {children}
      <DashboardIcon name="arrowRight" />
    </Link>
  );
}

function EmptyMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={styles.emptyMessage}>
      <span><DashboardIcon name="check" /></span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

type Drilldown =
  | { kind: "expenses"; title: string; subtitle: string; records: ExpenseRecord[] }
  | { kind: "flow"; point?: CashFlowPoint; title: string; subtitle: string; records: FlowMovement[] }
  | { kind: "income"; title: string; records: IncomeRecord[] };

function DrilldownSheet({
  detail,
  onClose,
}: {
  detail: Drilldown | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [detail, onClose]);

  if (!detail) return null;

  const expenseTotal =
    detail.kind === "expenses"
      ? detail.records.reduce((sum, record) => sum + record.amount, 0)
      : 0;
  const flowIn =
    detail.kind === "flow"
      ? detail.records
          .filter((record) => record.direction === "IN")
          .reduce((sum, record) => sum + record.amount, 0)
      : 0;
  const flowOut =
    detail.kind === "flow"
      ? detail.records
          .filter((record) => record.direction === "OUT")
          .reduce((sum, record) => sum + record.amount, 0)
      : 0;
  const incomeTotal =
    detail.kind === "income"
      ? detail.records.reduce((sum, record) => sum + record.amount, 0)
      : 0;

  return (
    <div className={styles.drawerLayer} role="presentation">
      <button className={styles.drawerBackdrop} onClick={onClose} aria-label="Close details" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title">
        <div className={styles.drawerHandle} />
        <header className={styles.drawerHeader}>
          <div>
            <h2 id="dashboard-detail-title">
              {detail.kind === "flow" && detail.point
                ? new Date(`${detail.point.date}T00:00:00`).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : detail.title}
            </h2>
            <p>
              {detail.kind === "expenses"
                ? detail.subtitle
                : detail.kind === "flow"
                  ? detail.subtitle
                  : "Income entries"}
            </p>
          </div>
          <button className={styles.iconButton} onClick={onClose} aria-label="Close details">
            <DashboardIcon name="close" />
          </button>
        </header>

        {detail.kind === "expenses" ? (
          <div className={styles.drawerSummary}>
            <div><span>Total</span><strong>{money(expenseTotal)}</strong></div>
            <div><span>Transactions</span><strong>{detail.records.length}</strong></div>
          </div>
        ) : detail.kind === "flow" ? (
          <div className={styles.drawerSummary}>
            <div><span>Money in</span><strong className={styles.positiveText}>{money(flowIn)}</strong></div>
            <div><span>Money out</span><strong className={styles.negativeText}>{money(flowOut)}</strong></div>
            <div><span>Net</span><strong>{money(flowIn - flowOut)}</strong></div>
          </div>
        ) : (
          <div className={styles.drawerSummary}>
            <div><span>Income</span><strong className={styles.positiveText}>{money(incomeTotal)}</strong></div>
            <div><span>Entries</span><strong>{detail.records.length}</strong></div>
          </div>
        )}

        <div className={styles.drawerBody}>
          {detail.kind === "expenses"
            ? detail.records.map((record) => (
                <Link key={record.id} href={`/transactions/${record.id}`} className={styles.detailRow}>
                  <span className={`${styles.detailIcon} ${styles.detailExpense}`}>
                    <DashboardIcon name="expense" />
                  </span>
                  <div>
                    <strong>{record.description}</strong>
                    <p>{record.category.name} · {record.account.accountName}</p>
                    <small>{dateTime(record.transactionAt)} · {record.transactionNumber}</small>
                  </div>
                  <b className={styles.negativeText}>−{money(record.amount)}</b>
                  <DashboardIcon name="arrowRight" />
                </Link>
              ))
            : detail.kind === "flow"
              ? detail.records.map((record) => (
                  <Link key={record.id} href={`/transactions/${record.transaction.id}`} className={styles.detailRow}>
                    <span className={`${styles.detailIcon} ${record.direction === "IN" ? styles.detailIn : styles.detailOut}`}>
                      <DashboardIcon name={record.direction === "IN" ? "arrowDown" : "arrowUp"} />
                    </span>
                    <div>
                      <strong>{record.description || titleCase(record.transaction.transactionType)}</strong>
                      <p>{record.account.accountName}{record.transaction.customer ? ` · ${record.transaction.customer.fullName}` : ""}</p>
                      <small>{record.transaction.transactionNumber} · {titleCase(record.account.accountType)}</small>
                    </div>
                    <b className={record.direction === "IN" ? styles.positiveText : styles.negativeText}>
                      {record.direction === "IN" ? "+" : "−"}{money(record.amount)}
                    </b>
                    <DashboardIcon name="arrowRight" />
                  </Link>
                ))
              : detail.records.map((record) => (
                  <Link key={record.id} href={`/transactions/${record.id}`} className={styles.detailRow}>
                    <span className={`${styles.detailIcon} ${styles.detailIn}`}>
                      <DashboardIcon name="receive" />
                    </span>
                    <div>
                      <strong>{record.description || titleCase(record.transactionType)}</strong>
                      <p>{record.customer?.fullName || titleCase(record.transactionType)}</p>
                      <small>{dateTime(record.transactionAt)} · {record.transactionNumber}</small>
                    </div>
                    <b className={styles.positiveText}>+{money(record.amount)}</b>
                    <DashboardIcon name="arrowRight" />
                  </Link>
                ))}
          {((detail.kind === "expenses" || detail.kind === "income") && !detail.records.length) ||
          (detail.kind === "flow" && !detail.records.length) ? (
            <EmptyMessage title="No records" detail="There are no posted records behind this selection." />
          ) : null}
        </div>

      </aside>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.skeletonPage} aria-label="Loading dashboard">
      <div className={`${styles.skeleton} ${styles.skeletonHeader}`} />
      <div className={`${styles.skeleton} ${styles.skeletonHero}`} />
      <div className={styles.skeletonGrid}>
        <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
        <div className={`${styles.skeleton} ${styles.skeletonPanel}`} />
      </div>
      <div className={`${styles.skeleton} ${styles.skeletonWide}`} />
    </div>
  );
}

function DueSide({
  kind,
  total,
  overdue,
  dueToday,
  rows,
}: {
  kind: "receive" | "pay";
  total: number;
  overdue: number;
  dueToday: number;
  rows: DueRecord[];
}) {
  const receiving = kind === "receive";
  const href = receiving ? "/receivables" : "/payables";
  return (
    <div className={`${styles.dueSide} ${receiving ? styles.dueReceive : styles.duePay}`}>
      <div className={styles.dueHeader}>
        <span className={styles.dueIcon}><DashboardIcon name={receiving ? "arrowDown" : "arrowUp"} /></span>
        <div>
          <p>{receiving ? "Money to receive" : "Money to pay"}</p>
          <strong>{money(total)}</strong>
        </div>
        <TextLink href={href}>View all</TextLink>
      </div>
      <div className={styles.dueSignals}>
        <span><b>{money(overdue)}</b> overdue</span>
        <span><b>{money(dueToday)}</b> due today</span>
      </div>
      <div className={styles.dueList}>
        {rows.slice(0, 4).map((row) => (
          <Link key={row.id} href={`${href}/${row.id}`} className={styles.dueRow}>
            <div>
              <strong>{row.customer.fullName}</strong>
              <span className={row.bucket === "OVERDUE" ? styles.overdueText : ""}>
                {row.bucket === "OVERDUE" ? "Overdue · " : "Due · "}{shortDate(row.dueAt)}
              </span>
            </div>
            <b>{money(row.remainingAmount)}</b>
            <DashboardIcon name="arrowRight" />
          </Link>
        ))}
        {!rows.length ? (
          <EmptyMessage
            title={receiving ? "Nothing outstanding" : "No payments due"}
            detail={receiving ? "Customer receivables will appear here." : "Upcoming obligations will appear here."}
          />
        ) : null}
      </div>
    </div>
  );
}

function ActivityRow({ record }: { record: RecentRecord }) {
  const expense = record.transactionType.includes("EXPENSE");
  const label = record.expense?.description || record.customer?.fullName || titleCase(record.transactionType);
  const meta = record.expense?.expenseCategory.name || titleCase(record.transactionType);
  return (
    <Link href={`/transactions/${record.id}`} className={styles.activityRow}>
      <span className={`${styles.activityIcon} ${expense ? styles.activityExpense : styles.activityDefault}`}>
        <DashboardIcon name={expense ? "expense" : "spark"} />
      </span>
      <div className={styles.activityMain}>
        <strong>{label}</strong>
        <p>{meta} · {dateTime(record.transactionAt)}</p>
      </div>
      <span className={`${styles.contextTag} ${record.context === "PERSONAL" ? styles.personalTag : styles.businessTag}`}>
        {record.context === "PERSONAL" ? "Personal" : "Business"}
      </span>
      <div className={styles.activityAmount}>
        <strong className={expense ? styles.negativeText : ""}>{expense ? "−" : ""}{money(record.netAmount ?? record.grossAmount)}</strong>
        <span>{titleCase(record.status)}</span>
      </div>
      <DashboardIcon name="arrowRight" />
    </Link>
  );
}

function PositionHistorySheet({
  open,
  rows,
  onClose,
}: {
  open: boolean;
  rows: PositionTrendPoint[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  if (!open) return null;
  const values=rows.map(row=>row.netPosition);
  const latest=rows.at(-1);
  const previous=rows.at(-2);
  const high=values.length?Math.max(...values):0;
  const low=values.length?Math.min(...values):0;
  const average=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
  const change=(latest?.netPosition??0)-(previous?.netPosition??0);
  return <div className={styles.drawerLayer} role="presentation">
    <button className={styles.drawerBackdrop} onClick={onClose} aria-label="Close position history" />
    <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="position-history-title">
      <div className={styles.drawerHandle} />
      <header className={styles.drawerHeader}>
        <div><h2 id="position-history-title">Last 10 Days Position</h2><p>Automatic daily position from the Cash Ledger.</p></div>
        <button className={styles.iconButton} onClick={onClose} aria-label="Close position history"><DashboardIcon name="close" /></button>
      </header>
      <div className={styles.positionHistorySummary}>
        <div><span>Latest</span><strong className={(latest?.netPosition??0)>=0?styles.positiveText:styles.negativeText}>{money(latest?.netPosition??0)}</strong></div>
        <div><span>Vs previous day</span><strong className={change>=0?styles.positiveText:styles.negativeText}>{change>=0?"+":""}{money(change)}</strong></div>
        <div><span>Highest</span><strong>{money(high)}</strong></div>
        <div><span>Lowest</span><strong>{money(low)}</strong></div>
        <div><span>Average</span><strong>{money(average)}</strong></div>
      </div>
      <div className={styles.positionHistoryChart}><PositionSparkline rows={rows} /></div>
      <div className={styles.drawerBody}>
        <div className={styles.positionHistoryList}>
          {[...rows].reverse().map((row,index)=>{
            const prior=[...rows].reverse()[index+1];
            const delta=prior?row.netPosition-prior.netPosition:0;
            return <div key={row.date} className={styles.positionHistoryRow}>
              <div><strong>{new Date(row.date+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</strong><small>Captured {new Date(row.capturedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</small></div>
              <div><strong className={row.netPosition>=0?styles.positiveText:styles.negativeText}>{money(row.netPosition)}</strong>{prior?<small className={delta>=0?styles.positiveText:styles.negativeText}>{delta>=0?"+":""}{money(delta)} vs previous</small>:<small>First day</small>}</div>
            </div>;
          })}
        </div>
      </div>
    </aside>
  </div>;
}

export function FinanceDashboard() {
  const [core, setCore] = useState<DashboardCore | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [context, setContext] = useState<FinancialContext>("ALL");
  const [period, setPeriod] = useState<DashboardPeriod>("30D");
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const [positionHistoryOpen, setPositionHistoryOpen] = useState(false);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, accounts, today, payables, receivables, obligations, positionTrend] =
        await Promise.all([
          apiFetch<DashboardCore["summary"]>("/dashboard/summary"),
          apiFetch<DashboardCore["accounts"]>("/dashboard/accounts"),
          apiFetch<DashboardCore["today"]>("/dashboard/today"),
          apiFetch<DashboardCore["payables"]>("/dashboard/payables"),
          apiFetch<DashboardCore["receivables"]>("/dashboard/receivables"),
          apiFetch<DashboardCore["obligations"]>("/dashboard/obligation-insights"),
          apiFetch<DashboardCore["positionTrend"]>("/dashboard/position-trend"),
        ]);
      setCore({ summary, accounts, today, payables, receivables, obligations, positionTrend });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dashboard could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const range = useMemo(() => periodRange(period), [period]);

  useEffect(() => {
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      scope: context,
    });
    apiFetch<DashboardAnalytics>(`/dashboard/analytics?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setAnalytics(result);
      })
      .catch((caught) => {
        if (!cancelled) {
          setAnalyticsError(caught instanceof Error ? caught.message : "Analytics could not load");
        }
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context, range.from, range.to]);

  const categories = useMemo<ExpenseCategoryGroup[]>(() => {
    if (!analytics) return [];
    const groups = new Map<string, { name: string; amount: number; transactions: ExpenseRecord[] }>();
    for (const transaction of analytics.expenses.transactions) {
      const current = groups.get(transaction.category.id) ?? {
        name: transaction.category.name,
        amount: 0,
        transactions: [],
      };
      current.amount += transaction.amount;
      current.transactions.push(transaction);
      groups.set(transaction.category.id, current);
    }
    return [...groups.entries()]
      .map(([id, group], index) => ({
        id,
        name: group.name,
        amount: group.amount,
        transactions: group.transactions,
        percentage: analytics.expenses.total ? (group.amount / analytics.expenses.total) * 100 : 0,
        color: categoryPalette[index % categoryPalette.length],
      }))
      .sort((a, b) => b.amount - a.amount)
      .map((category, index) => ({ ...category, color: categoryPalette[index % categoryPalette.length] }));
  }, [analytics]);

  useEffect(() => {
    if (!categories.length) setSelectedCategoryId(null);
    else if (!selectedCategoryId || !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  if (loading) {
    return <AppShell><DashboardSkeleton /></AppShell>;
  }

  if (error || !core) {
    return (
      <AppShell>
        <div className={styles.errorState}>
          <span><DashboardIcon name="warning" /></span>
          <h1>Dashboard could not load</h1>
          <p>{error || "Please try again."}</p>
          <button onClick={loadCore}>Try again</button>
        </div>
      </AppShell>
    );
  }

  const { summary, today } = core;
  const trendStart = core.positionTrend[0]?.netPosition ?? summary.netFinancialPosition;
  const trendDelta = summary.netFinancialPosition - trendStart;
  const positionValues = core.positionTrend.map((row) => row.netPosition);
  const positionLatest = core.positionTrend.at(-1);
  const positionPrevious = core.positionTrend.at(-2);
  const positionDayDelta = (positionLatest?.netPosition ?? summary.netFinancialPosition) - (positionPrevious?.netPosition ?? positionLatest?.netPosition ?? summary.netFinancialPosition);
  const positionHigh = positionValues.length ? Math.max(...positionValues) : summary.netFinancialPosition;
  const positionLow = positionValues.length ? Math.min(...positionValues) : summary.netFinancialPosition;
  const positionAverage = positionValues.length ? positionValues.reduce((sum,value)=>sum+value,0)/positionValues.length : summary.netFinancialPosition;
  const scopeAccounts = core.accounts
    .filter(
      (account) =>
        (account.isActive || Math.abs(account.currentBalance) > 0.005) &&
        account.accountNature === "ASSET" &&
        account.accountType !== "OWNER_CREDIT_CARD" &&
        (context === "ALL" || account.usageType === context || account.usageType === "MIXED"),
    )
    .sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance));
  const scopeCards = core.accounts.filter(
    (account) =>
      (account.isActive || Math.abs(account.currentBalance) > 0.005) &&
      account.accountType === "OWNER_CREDIT_CARD" &&
      (context === "ALL" || account.usageType === context || account.usageType === "MIXED"),
  );
  const maxAccountBalance = Math.max(1, ...scopeAccounts.map((account) => Math.abs(account.currentBalance)));
  const scopeFunds = scopeAccounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const scopeCreditAvailable = scopeCards.reduce((sum, account) => sum + Math.max(0, account.availableCredit ?? 0), 0);
  const scopeCurrentAvailability = scopeFunds + scopeCreditAvailable;
  const scopedBalance = (types: string[]) => scopeAccounts
    .filter((account) => types.includes(account.accountType))
    .reduce((sum, account) => sum + account.currentBalance, 0);
  const currentAvailability = context === "ALL" ? summary.currentAvailability : scopeCurrentAvailability;
  const allocationSource = [
    { id: "cash", label: "Cash", value: context === "ALL" ? summary.cashBalance : scopedBalance(["CASH"]), color: "#55a4f4", href: "/cash-counter" },
    { id: "bank", label: "Bank + UPI", value: context === "ALL" ? summary.bankBalance + summary.upiBalance : scopedBalance(["BANK", "UPI"]), color: "#6366d9", href: "/accounts?type=BANK" },
    { id: "wallet", label: "Provider wallets", value: context === "ALL" ? summary.walletBalance : scopedBalance(["PROVIDER_WALLET"]), color: "#12a47b", href: "/accounts?type=PROVIDER_WALLET" },
    { id: "credit", label: "Available credit", value: context === "ALL" ? summary.creditCardAvailable : scopeCreditAvailable, color: "#f0ad4e", href: "/accounts?type=OWNER_CREDIT_CARD" },
  ];
  const allocationBase = Math.max(1, allocationSource.reduce((sum, item) => sum + Math.max(0, item.value), 0));
  const allocationItems = allocationSource.map((item) => ({
    ...item,
    percentage: (Math.max(0, item.value) / allocationBase) * 100,
  }));
  const largestCategory = categories[0];
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? largestCategory;
  const topExpenses = analytics?.expenses.transactions.slice().sort((a, b) => b.amount - a.amount).slice(0, 4) ?? [];
  const comparison = analytics?.expenses.previousTotal
    ? ((analytics.expenses.total - analytics.expenses.previousTotal) / analytics.expenses.previousTotal) * 100
    : null;
  const incomeExpenseMax = Math.max(1, analytics?.income.total ?? 0, analytics?.expenses.total ?? 0);

  const attentionItems = [
    summary.receivableBreakdown.overdueAmount > 0
      ? {
          tone: "danger",
          icon: "receive" as DashboardIconName,
          title: `${money(summary.receivableBreakdown.overdueAmount)} receivable overdue`,
          detail: `${summary.receivableBreakdown.overdueCount} customer record${summary.receivableBreakdown.overdueCount === 1 ? "" : "s"} need follow-up`,
          href: "/receivables?bucket=overdue",
        }
      : null,
    summary.payableBreakdown.overdueAmount > 0
      ? {
          tone: "danger",
          icon: "arrowUp" as DashboardIconName,
          title: `${money(summary.payableBreakdown.overdueAmount)} payable overdue`,
          detail: `${summary.payableBreakdown.overdueCount} obligation${summary.payableBreakdown.overdueCount === 1 ? "" : "s"} past due`,
          href: "/payables?bucket=overdue",
        }
      : null,
    summary.pendingProviderSettlements > 0
      ? {
          tone: "warning",
          icon: "clock" as DashboardIconName,
          title: `${money(summary.pendingProviderSettlements)} awaiting settlement`,
          detail: `${summary.pendingProviderSettlementCount} provider settlement${summary.pendingProviderSettlementCount === 1 ? "" : "s"} still clearing`,
          href: "/provider-settlements",
        }
      : null,
    summary.payableBreakdown.dueTodayAmount > 0
      ? {
          tone: "warning",
          icon: "calendar" as DashboardIconName,
          title: `${money(summary.payableBreakdown.dueTodayAmount)} due today`,
          detail: `${summary.payableBreakdown.dueTodayCount} payment${summary.payableBreakdown.dueTodayCount === 1 ? "" : "s"} scheduled today`,
          href: "/payables?bucket=today",
        }
      : null,
    summary.receivableBreakdown.dueTodayAmount > 0
      ? {
          tone: "warning",
          icon: "receive" as DashboardIconName,
          title: `${money(summary.receivableBreakdown.dueTodayAmount)} collections due today`,
          detail: `${summary.receivableBreakdown.dueTodayCount} customer collection${summary.receivableBreakdown.dueTodayCount === 1 ? "" : "s"} expected today`,
          href: "/receivables?bucket=today",
        }
      : null,
  ].filter(Boolean) as Array<{
    tone: string;
    icon: DashboardIconName;
    title: string;
    detail: string;
    href: string;
  }>;

  const positionBuckets = [
    { label: "Physical cash", value: summary.cashBalance, href: "/cash-counter", icon: "cash" as DashboardIconName, tone: "blue" },
    { label: "Bank + UPI", value: summary.bankBalance + summary.upiBalance, href: "/accounts", icon: "bank" as DashboardIconName, tone: "blue" },
    { label: "Provider wallets", value: summary.walletBalance, href: "/accounts?type=PROVIDER_WALLET", icon: "wallet" as DashboardIconName, tone: "blue" },
    { label: "Receivables", value: summary.customerReceivable, href: "/receivables", icon: "receive" as DashboardIconName, tone: "green" },
    { label: "Pending settlement", value: summary.pendingProviderSettlements, href: "/provider-settlements", icon: "clock" as DashboardIconName, tone: "amber" },
    { label: "Payables", value: -summary.customerPayable, href: "/payables", icon: "arrowUp" as DashboardIconName, tone: "rose" },
    { label: "Card outstanding", value: -summary.creditCardOutstanding, href: "/accounts?type=OWNER_CREDIT_CARD", icon: "card" as DashboardIconName, tone: "rose" },
  ];

  const todayMetrics = [
    { label: "Cash in", value: today.cashIn, icon: "arrowDown" as DashboardIconName, tone: "positive", href: "/transactions?range=today" },
    { label: "Cash out", value: today.cashOut, icon: "arrowUp" as DashboardIconName, tone: "negative", href: "/transactions?range=today" },
    { label: "GPay / transfer", value: today.cashTransfer, icon: "upi" as DashboardIconName, tone: "neutral", href: "/transactions?type=CASH_TRANSFER" },
    { label: "Card swipe", value: today.cardSwipe, icon: "card" as DashboardIconName, tone: "neutral", href: "/transactions?type=CARD_SWIPE" },
    { label: "AePS / Aadhaar", value: today.aeps, icon: "user" as DashboardIconName, tone: "neutral", href: "/transactions?type=AEPS_WITHDRAWAL" },
    { label: "Micro ATM", value: today.microAtm, icon: "cash" as DashboardIconName, tone: "neutral", href: "/transactions?type=MICRO_ATM" },
    { label: "Settlements", value: today.settlementsReceived, icon: "wallet" as DashboardIconName, tone: "positive", href: "/provider-settlements" },
    { label: "Commission", value: today.commission, icon: "spark" as DashboardIconName, tone: "positive", href: "/reports" },
    { label: "Provider charges", value: today.providerCharges, icon: "expense" as DashboardIconName, tone: "negative", href: "/reports" },
    { label: "Expenses", value: today.businessExpense + today.personalExpense, icon: "expense" as DashboardIconName, tone: "negative", href: "/expenses" },
    { label: "Collections", value: today.customerReceipt, icon: "receive" as DashboardIconName, tone: "positive", href: "/receivables" },
    { label: "Customer payout", value: today.customerPayout, icon: "arrowUp" as DashboardIconName, tone: "negative", href: "/payables" },
  ];

  function openCategory(category: ExpenseCategoryGroup) {
    setSelectedCategoryId(category.id);
    setDrilldown({
      kind: "expenses",
      title: category.name,
      subtitle: `${range.label} · ${context === "ALL" ? "All spending" : titleCase(context)}`,
      records: category.transactions,
    });
  }

  function openAllExpenses(title = "Expenses", records = analytics?.expenses.transactions ?? []) {
    setDrilldown({
      kind: "expenses",
      title,
      subtitle: `${range.label} · ${context === "ALL" ? "All spending" : titleCase(context)}`,
      records,
    });
  }

  function openFlow(point: CashFlowPoint) {
    setDrilldown({
      kind: "flow",
      point,
      title: "Daily account movement",
      subtitle: "Account movements in this view",
      records: analytics?.cashFlow.movements.filter((record) => record.date === point.date) ?? [],
    });
  }

  function openFlowSummary(direction: FlowMovement["direction"]) {
    const label = direction === "IN" ? "Money in" : "Money out";
    setDrilldown({
      kind: "flow",
      title: `${label} · ${range.label}`,
      subtitle: `${range.label} · ${context === "ALL" ? "All" : titleCase(context)}`,
      records: analytics?.cashFlow.movements.filter((record) => record.direction === direction) ?? [],
    });
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.commandHeader}>
          <div>
            <h1>Financial overview</h1>
          </div>
          <div className={styles.commandControls}>
            <div className={styles.contextControl} role="group" aria-label="Financial context">
              {(["ALL", "BUSINESS", "PERSONAL"] as FinancialContext[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setContext(value)}
                  className={context === value ? styles.contextActive : ""}
                  aria-pressed={context === value}
                >
                  {titleCase(value)}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className={styles.positionHero} aria-labelledby="financial-position-title">
          <div className={styles.positionLead}>
            <div className={styles.positionCopy}>
              <div className={styles.positionLabel}>
                <span><DashboardIcon name="eye" /></span>
                <p id="financial-position-title">Net position</p>
              </div>
              <strong className={styles.positionAmount}>{money(summary.netFinancialPosition)}</strong>
              <div className={styles.positionMeta}>
                <span className={trendDelta >= 0 ? styles.trendUp : styles.trendDown}>
                  <DashboardIcon name={trendDelta >= 0 ? "arrowUp" : "arrowDown"} />
                  {trendDelta >= 0 ? "+" : ""}{money(trendDelta)} over 10 days
                </span>
                <span>{money(summary.currentAvailability)} current availability</span>
                <button type="button" className={styles.positionMetaHistory} onClick={()=>setPositionHistoryOpen(true)}>
                  {positionDayDelta>=0?"+":""}{money(positionDayDelta)} vs previous day · View history
                </button>
              </div>
            </div>
            <div className={styles.positionTrend}>
              <div className={styles.positionTrendHeader}><span>Last 10 Days Position</span><strong>{compactMoney(summary.netFinancialPosition)}</strong></div>
              <PositionSparkline rows={core.positionTrend} />
              <div className={styles.positionTrendFacts}>
                <span>High <strong>{compactMoney(positionHigh)}</strong></span>
                <span>Low <strong>{compactMoney(positionLow)}</strong></span>
                <span>Avg <strong>{compactMoney(positionAverage)}</strong></span>
              </div>
              <button type="button" className={styles.positionHistoryButton} onClick={()=>setPositionHistoryOpen(true)}>View history <DashboardIcon name="arrowRight" /></button>
            </div>
          </div>
          <div className={styles.positionComposition}>
            {positionBuckets.map((bucket) => (
              <Link key={bucket.label} href={bucket.href} className={styles.positionBucket} data-tone={bucket.tone}>
                <span><DashboardIcon name={bucket.icon} /></span>
                <div><small>{bucket.label}</small><strong>{bucket.value < 0 ? "−" : ""}{money(Math.abs(bucket.value))}</strong></div>
                <DashboardIcon name="arrowRight" />
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.fundsPanel} aria-labelledby="funds-title">
          <div className={styles.fundsMain}>
            <SectionHeading
              id="funds-title"
              title="Funds & accounts"
              action={<TextLink href="/accounts">Manage accounts</TextLink>}
            />
            <div className={styles.accountList}>
              {scopeAccounts.slice(0, 5).map((account) => (
                <Link href={`/accounts/${account.id}`} key={account.id} className={styles.accountRow}>
                  <span className={styles.accountIcon}><DashboardIcon name={accountIcon(account.accountType)} /></span>
                  <div className={styles.accountIdentity}>
                    <strong>{account.accountName}</strong>
                    <p>{titleCase(account.accountType)} · {titleCase(account.usageType)}</p>
                  </div>
                  <div className={styles.accountBar} aria-hidden="true">
                    <i style={{ width: `${Math.max(3, (Math.abs(account.currentBalance) / maxAccountBalance) * 100)}%` }} />
                  </div>
                  <b>{money(account.currentBalance)}</b>
                  <DashboardIcon name="arrowRight" />
                </Link>
              ))}
              {!scopeAccounts.length ? (
                <EmptyMessage title="No accounts in this context" detail="Assign an account as Business, Personal, or Mixed to see it here." />
              ) : null}
            </div>
          </div>
          <aside className={styles.liquiditySummary}>
            <div className={styles.allocationHeader}>
              <div>
                <p className={styles.eyebrow}>Available allocation</p>
                <strong>{money(currentAvailability)}</strong>
                <span>{context === "ALL" ? "Where your usable capacity sits" : `${titleCase(context)} + mixed-use capacity`}</span>
              </div>
              <Link href="/accounts" className={styles.allocationOpen} aria-label="Open accounts">
                <DashboardIcon name="arrowRight" />
              </Link>
            </div>

            <div className={styles.allocationChart}>
              <FundsAllocationDonut
                items={allocationItems}
                total={currentAvailability}
                selectedId={selectedAllocationId}
                onSelect={(item) => setSelectedAllocationId(item.id)}
              />
              <p className={styles.allocationHint}>Hover on desktop or touch a slice to inspect.</p>
            </div>

            <div className={styles.allocationRows}>
              {allocationItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={styles.allocationRow}
                  data-active={selectedAllocationId === item.id}
                  onMouseEnter={() => setSelectedAllocationId(item.id)}
                  onFocus={() => setSelectedAllocationId(item.id)}
                >
                  <span className={styles.allocationLabel}>
                    <i style={{ background: item.color }} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.percentage.toFixed(1)}% of availability</small>
                    </span>
                  </span>
                  <b>{money(item.value)}</b>
                  <DashboardIcon name="arrowRight" />
                </Link>
              ))}
            </div>
          </aside>
        </section>

        <section className={`${styles.flowPanel} ${analyticsLoading ? styles.analyticsRefreshing : ""}`} aria-busy={analyticsLoading}>
          <SectionHeading
            title="Cash flow"
            description={`${range.label} · ${context === "ALL" ? "All accounts" : titleCase(context)}`}
            action={
              <div className={styles.periodControl} role="group" aria-label="Cash flow period">
                {([
                  ["7D", "7 days"],
                  ["30D", "30 days"],
                  ["THIS_MONTH", "This month"],
                ] as Array<[DashboardPeriod, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={period === value ? styles.periodActive : ""}
                    aria-pressed={period === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          {analyticsError ? <div className={styles.inlineError}>{analyticsError}</div> : null}
          {analytics ? (
            <>
              <div className={styles.flowTotals}>
                <button onClick={() => openFlowSummary("IN")}>
                  <span><i className={styles.flowInMark} />Money in</span>
                  <strong className={styles.positiveText}>{money(analytics.cashFlow.moneyIn)}</strong>
                </button>
                <button onClick={() => openFlowSummary("OUT")}>
                  <span><i className={styles.flowOutMark} />Money out</span>
                  <strong className={styles.negativeText}>{money(analytics.cashFlow.moneyOut)}</strong>
                </button>
                <div>
                  <span>Net movement</span>
                  <strong className={analytics.cashFlow.net >= 0 ? styles.positiveText : styles.negativeText}>
                    {analytics.cashFlow.net >= 0 ? "+" : ""}{money(analytics.cashFlow.net)}
                  </strong>
                </div>
              </div>
              <div className={styles.flowChartFrame}>
                <CashFlowChart rows={analytics.cashFlow.series} onSelect={openFlow} />
              </div>
            </>
          ) : <div className={styles.analyticsPlaceholder} />}
        </section>

        <section className={styles.todayPanel}>
          <SectionHeading
            title="Today"
            action={<TextLink href="/transactions">View activity</TextLink>}
          />
          <div className={styles.todayGrid}>
            {todayMetrics.map((metric) => (
              <Link href={metric.href} key={metric.label} className={styles.todayMetric} data-tone={metric.tone}>
                <span><DashboardIcon name={metric.icon} /></span>
                <div><small>{metric.label}</small><strong>{money(metric.value)}</strong></div>
                <DashboardIcon name="arrowRight" />
              </Link>
            ))}
          </div>
        </section>

        <div className={styles.bottomGrid}>
          <section className={styles.attentionPanel}>
            <SectionHeading title="Needs attention" />
            <div className={styles.attentionList}>
              {attentionItems.map((item) => (
                <Link href={item.href} key={item.title} className={styles.attentionRow} data-tone={item.tone}>
                  <span><DashboardIcon name={item.icon} /></span>
                  <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                  <DashboardIcon name="arrowRight" />
                </Link>
              ))}
              {!attentionItems.length ? (
                <EmptyMessage title="Nothing needs attention" detail="No overdue dues or pending settlements." />
              ) : null}
            </div>
          </section>

          <section className={`${styles.activityPanel} ${analyticsLoading ? styles.analyticsRefreshing : ""}`} aria-busy={analyticsLoading}>
            <SectionHeading
              title="Recent activity"
              description={`${range.label} · ${titleCase(context)}`}
              action={<TextLink href="/transactions">View ledger</TextLink>}
            />
            <div className={styles.activityList}>
              {analytics?.recent.slice(0, 8).map((record) => <ActivityRow key={record.id} record={record} />)}
              {analytics && !analytics.recent.length ? <EmptyMessage title="No recent activity" detail="Change the period or context to inspect another view." /> : null}
            </div>
          </section>
        </div>
      </div>
      <div className="fixed right-3 z-[45] flex flex-col items-end gap-2 bottom-[calc(5.35rem+env(safe-area-inset-bottom))] lg:bottom-5 lg:right-5">
        <Link href="/cash-counter?quick=IN" aria-label="Cash in" className="flex min-h-10 items-center gap-2 rounded-full bg-emerald-600 px-3.5 text-[13px] font-black text-white shadow-[0_6px_18px_rgba(5,150,105,.20)] transition hover:-translate-y-0.5 active:translate-y-0">
          <span className="text-base">↓</span><span>Cash In</span>
        </Link>
        <Link href="/cash-counter?quick=OUT" aria-label="Cash out" className="flex min-h-10 items-center gap-2 rounded-full bg-rose-600 px-3.5 text-[13px] font-black text-white shadow-[0_6px_18px_rgba(225,29,72,.18)] transition hover:-translate-y-0.5 active:translate-y-0">
          <span className="text-base">↑</span><span>Cash Out</span>
        </Link>
      </div>
      <DrilldownSheet detail={drilldown} onClose={closeDrilldown} />
      <PositionHistorySheet open={positionHistoryOpen} rows={core.positionTrend} onClose={()=>setPositionHistoryOpen(false)} />
    </AppShell>
  );
}
