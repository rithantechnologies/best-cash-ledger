import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionHeading, Surface } from "@/components/ui";

const groups = [
  {
    title:"Customer services",
    description:"Transactions performed for a customer at the counter.",
    items:[
      ["CS","Credit Card Swipe","/transactions/card-swipe","Record a swipe, customer payable, charges and provider clearing.","bg-violet-50 text-violet-700"],
      ["CT","Cash Transfer","/transactions/cash-transfer","Receive cash and transfer from bank, UPI or wallet.","bg-emerald-50 text-emerald-700"],
      ["AP","AePS Withdrawal","/transactions/aeps","Record Aadhaar-enabled withdrawal and settlement.","bg-cyan-50 text-cyan-700"],
      ["MA","Micro ATM","/transactions/micro-atm","Pay customer cash and track provider principal plus commission settlement.","bg-sky-50 text-sky-700"],
    ],
  },
  {
    title:"Business money movement",
    description:"Move or withdraw money between accounts you control.",
    items:[
      ["IT","Internal Transfer","/transactions/internal-transfer","Move money between your own accounts.","bg-indigo-50 text-indigo-700"],
      ["ATM","ATM Withdrawal","/transactions/atm-withdrawal","Move bank funds to cash and capture ATM charges.","bg-sky-50 text-sky-700"],
      ["CC","Owner CC Payment","/transactions/owner-credit-card-payment","Repay an owner credit-card liability.","bg-rose-50 text-rose-700"],
    ],
  },
  {
    title:"Obligations & spending",
    description:"Settle what is owed or record operating expenses.",
    items:[
      ["CP","Customer Payout","/payables","Pay an open customer payable.","bg-amber-50 text-amber-700"],
      ["EX","Expense","/transactions/expense","Record business or personal expenditure.","bg-orange-50 text-orange-700"],
    ],
  },
] as const;

export default function NewTransactionPage() {
  return <AppShell><div className="page-enter mx-auto max-w-6xl space-y-5">
    <SectionHeading eyebrow="Quick entry" title="New transaction" description="Choose what happened. Cash Ledger will only ask for the fields needed for that workflow."/>
    <div className="space-y-4">{groups.map(group=><Surface key={group.title} className="p-4 sm:p-5">
      <div className="mb-4"><h3 className="font-bold tracking-tight">{group.title}</h3><p className="mt-0.5 text-xs text-slate-500">{group.description}</p></div>
      <div className="grid gap-2.5 md:grid-cols-3">{group.items.map(([mark,label,href,description,tone])=><Link key={href} href={href}
        className="group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-sm">
        <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-black "+tone}>{mark}</span>
        <span className="min-w-0"><span className="flex items-center gap-2 text-sm font-bold text-slate-900">{label}<span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500">→</span></span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span></span>
      </Link>)}</div>
    </Surface>)}</div>
  </div></AppShell>;
}
