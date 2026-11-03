import CardSwipeReportClient from "./card-swipe-report-client";

// Never ship a year-cached HTML shell that points at a release-specific chunk.
// Staff commonly leave the mobile app open across Cash Ledger deployments.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CreditCardReportPage() {
  return <CardSwipeReportClient />;
}
