"use client";

import CashCounterWorkspace from "@/components/cash-counter-workspace";

// Next.js route components receive PageProps, not the modal-only props
// supported by the reusable workspace component.
export default function CashCounterPage() {
  return <CashCounterWorkspace />;
}
