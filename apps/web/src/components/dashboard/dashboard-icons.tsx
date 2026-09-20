import type { ReactNode } from "react";

export type DashboardIconName =
  | "arrowDown"
  | "arrowRight"
  | "arrowUp"
  | "bank"
  | "calendar"
  | "card"
  | "cash"
  | "chart"
  | "check"
  | "clock"
  | "close"
  | "expense"
  | "eye"
  | "more"
  | "receive"
  | "spark"
  | "upi"
  | "user"
  | "wallet"
  | "warning";

const paths: Record<DashboardIconName, ReactNode> = {
  arrowDown: <><path d="M12 4v16"/><path d="m6.5 14.5 5.5 5.5 5.5-5.5"/></>,
  arrowRight: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
  arrowUp: <><path d="M12 20V4"/><path d="m6.5 9.5 5.5-5.5 5.5 5.5"/></>,
  bank: <><path d="M3 9h18"/><path d="M5 9v9M9.7 9v9M14.3 9v9M19 9v9M3 19h18M12 3 3 7.5h18z"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></>,
  cash: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9h.01M18 15h.01"/></>,
  chart: <><path d="M4 19V9M10 19V4M16 19v-7M22 19H2"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  expense: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  receive: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></>,
  spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></>,
  upi: <><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6M10 17h4"/></>,
  user: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.6-4.7 2.9-7 7-7s6.4 2.3 7 7"/></>,
  wallet: <><path d="M4 7h14v12H4z"/><path d="M4 7V5h12"/><path d="M15 11h6v5h-6z"/></>,
  warning: <><path d="m12 3 10 18H2z"/><path d="M12 9v5M12 17.5h.01"/></>,
};

export function DashboardIcon({
  name,
  className,
}: {
  name: DashboardIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
