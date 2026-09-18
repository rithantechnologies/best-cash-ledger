import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const flows = [
  ["Credit Card Swipe", "/transactions/card-swipe", "Swipe, charges, commission and payable"],
  ["Cash Transfer", "/transactions/cash-transfer", "Cash received and bank/UPI transfer"],
  ["AePS Withdrawal", "/transactions/aeps", "Aadhaar-linked withdrawal record"],
  ["Customer Payout", "/payables", "Pay an open customer payable"],
  ["Internal Transfer", "/transactions/internal-transfer", "Move money between own accounts"],
  ["Expense", "/transactions/expense", "Business or personal expense"],
  ["ATM Withdrawal", "/transactions/atm-withdrawal", "Bank to cash with ATM charge"],
  ["Owner CC Payment", "/transactions/owner-credit-card-payment", "Repay owner credit-card liability"],
] as const;

export default function NewTransactionPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div><h2 className="text-2xl font-bold">New Transaction</h2><p className="text-sm text-slate-500">Choose the transaction type.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map(([label, href, description]) => (
            <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400">
              <h3 className="font-semibold">{label}</h3>
              <p className="mt-2 text-sm text-slate-500">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
