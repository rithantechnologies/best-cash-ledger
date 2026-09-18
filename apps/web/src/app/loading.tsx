import { PageLoader } from "@/components/ui";

export default function Loading() {
  return <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
    <PageLoader label="Opening Cash Ledger…" />
  </main>;
}
