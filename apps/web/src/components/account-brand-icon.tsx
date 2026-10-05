/* eslint-disable @next/next/no-img-element */

type AccountBrandLike = {
  accountName: string;
  accountType: string;
  bankName?: string | null;
};

type AccountBrand = {
  label: string;
  image?: string;
  imageClass?: string;
  initials?: string;
  background: string;
  foreground: string;
};

type BrandRule = AccountBrand & {
  match: (value: string) => boolean;
};

const assetBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const token = (value: string, word: string) =>
  new RegExp(`(^|[^A-Z0-9])${word}([^A-Z0-9]|$)`).test(value);

const brandRules: BrandRule[] = [
  { label: "PhonePe", image: "/account-brands/phonepe.png", background: "#f2eafd", foreground: "#5f259f", match: (v) => v.includes("PHONEPE") },
  { label: "Airtel Payments Bank", image: "/account-brands/airtel-payments-bank.png", background: "#fff0f0", foreground: "#e40000", match: (v) => v.includes("AIRTEL") },
  { label: "State Bank of India", image: "/account-brands/sbi.png", background: "#eaf7ff", foreground: "#00a9e0", match: (v) => token(v, "SBI") || v.includes("STATE BANK OF INDIA") },
  { label: "Axis Bank", image: "/account-brands/axis.png", background: "#fff0f5", foreground: "#97144d", match: (v) => token(v, "AXIS") || v.includes("AXIS BANK") },
  { label: "Bank of Baroda", image: "/account-brands/bank-of-baroda.png", background: "#fff4e7", foreground: "#f26522", match: (v) => token(v, "BOB") || v.includes("BANK OF BARODA") },
  { label: "Bank of India", image: "/account-brands/boi.png", background: "#fff5e8", foreground: "#005baa", match: (v) => token(v, "BOI") || v.includes("BANK OF INDIA") },
  { label: "Canara Bank", image: "/account-brands/canara.png", background: "#edf9ff", foreground: "#009fe3", match: (v) => v.includes("CANARA") },
  { label: "City Union Bank", image: "/account-brands/city-union-bank.jpg", background: "#f5f4ff", foreground: "#312e81", match: (v) => token(v, "CUB") || v.includes("CITY UNION BANK") },
  { label: "Indian Overseas Bank", initials: "IOB", background: "#eaf0ff", foreground: "#003f98", match: (v) => token(v, "IOB") || v.includes("INDIAN OVERSEAS") },
  { label: "Indian Bank", image: "/account-brands/indian-bank.jpg", background: "#fff4d8", foreground: "#0055a5", match: (v) => token(v, "INDIAN") || v.includes("INDIAN BANK") },
  { label: "IndusInd Bank", image: "/account-brands/indusind.png", background: "#fff0ef", foreground: "#a73a36", match: (v) => v.includes("INDUS") },
  { label: "Karur Vysya Bank", initials: "KVB", background: "#f6f7a5", foreground: "#007a4d", match: (v) => token(v, "KVB") || v.includes("KARUR VYSYA") },
  { label: "Fino Payments Bank", image: "/account-brands/fino.png", background: "#fff0f1", foreground: "#ef3340", match: (v) => v.includes("FINO") },
  { label: "ICICI Bank", image: "/account-brands/icici.png", background: "#fff2e9", foreground: "#b02a30", match: (v) => v.includes("ICICI") },
  { label: "Union Bank of India", image: "/account-brands/union-bank-of-india.png", background: "#f1f7ff", foreground: "#0057a8", match: (v) => token(v, "UBI") || v.includes("UNION BANK OF INDIA") },
  { label: "BANKIT", image: "/account-brands/bankit.png", background: "#eaf8ff", foreground: "#00a9e0", match: (v) => v.includes("BANKIT") },
  { label: "ROINET", image: "/account-brands/roinet.png", background: "#f4f7ff", foreground: "#194e9d", match: (v) => v.includes("ROINET") },
  { label: "SriMoney", image: "/account-brands/srimoney.png", background: "#eefaff", foreground: "#149cc4", match: (v) => v.includes("SRIMONEY") || v.includes("SRI MONEY") },
  { label: "DigiSeva", image: "/account-brands/digiseva.svg", imageClass: "h-6 w-8 object-contain", background: "#f6f8ff", foreground: "#3b3fa2", match: (v) => v.includes("DIGISEVA") || v.includes("DIGI SEVA") },
  { label: "PaySwitch", initials: "PS", background: "#eef6ff", foreground: "#1d4f91", match: (v) => v.includes("PAYSWITCH") || v.includes("PAY SWITCH") },
  { label: "24PAY", image: "/account-brands/24pay.png", imageClass: "h-6 w-8 object-contain", background: "#f4f5ff", foreground: "#5b5cf0", match: (v) => v.includes("24PAY") || v.includes("24 PAY") },
  { label: "A2Z Suvidhaa", image: "/account-brands/a2z-suvidhaa.jpg", imageClass: "h-7 w-auto max-w-none justify-self-start -translate-x-1", background: "#fff8ef", foreground: "#e77724", match: (v) => v.includes("A2Z") },
  { label: "Easy Pay", image: "/account-brands/easypay.png", imageClass: "h-5 w-8 object-contain", background: "#f4f7fb", foreground: "#0057a8", match: (v) => v.includes("EASYPAY") || v.includes("EASY PAY") },
  { label: "Swift Money", image: "/account-brands/swift-money.jpg", imageClass: "h-6 w-8 object-contain", background: "#f5f8ff", foreground: "#174d8a", match: (v) => v.includes("SWIFT MONEY") },
  { label: "RD Wallet", initials: "RD", background: "#f2f4f7", foreground: "#344054", match: (v) => token(v, "RD") },
  { label: "Visa", initials: "VISA", background: "#edf2ff", foreground: "#1434cb", match: (v) => token(v, "VISA") },
  { label: "Mastercard", initials: "MC", background: "#fff1ea", foreground: "#eb001b", match: (v) => v.includes("MASTERCARD") || v.includes("MASTER CARD") },
  { label: "RuPay", initials: "RP", background: "#edf8f2", foreground: "#1a7744", match: (v) => v.includes("RUPAY") },
];

function normalizedAccountText(account: AccountBrandLike) {
  return [account.bankName, account.accountName]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function fallbackInitials(account: AccountBrandLike) {
  const generic = new Set(["WALLET", "BANK", "ACCOUNT", "CARD", "CREDIT", "OWNER", "AC", "CC"]);
  const words = account.accountName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !generic.has(word));
  if (!words.length) return account.accountType === "OWNER_CREDIT_CARD" ? "CC" : account.accountType === "PROVIDER_WALLET" ? "W" : "B";
  if (words[0].length <= 3 && /\d/.test(words[0])) return words[0].slice(0, 3);
  if (words.length === 1) return words[0].slice(0, 3);
  return (words[0][0] + words[1][0]).slice(0, 3);
}

export function accountBrand(account: AccountBrandLike): AccountBrand {
  const value = normalizedAccountText(account);
  const matched = brandRules.find((rule) => rule.match(value));
  if (matched) return matched;
  if (account.accountType === "OWNER_CREDIT_CARD") {
    return { label: account.accountName, initials: fallbackInitials(account), background: "#fff0f2", foreground: "#c2415d" };
  }
  if (account.accountType === "PROVIDER_WALLET") {
    return { label: account.accountName, initials: fallbackInitials(account), background: "#ebfaf4", foreground: "#117a5b" };
  }
  return { label: account.bankName || account.accountName, initials: fallbackInitials(account), background: "#edf5ff", foreground: "#315f9f" };
}

export function AccountBrandIcon({
  account,
  className = "",
}: {
  account: AccountBrandLike;
  className?: string;
}) {
  const brand = accountBrand(account);
  return (
    <span
      className={"grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-black/[.05] " + className}
      style={{ backgroundColor: brand.background, color: brand.foreground }}
      title={brand.label}
      aria-label={brand.label}
    >
      {brand.image ? (
        <img src={assetBasePath + brand.image} alt="" className={brand.imageClass ?? "h-7 w-7 object-contain"} aria-hidden="true" />
      ) : (
        <span className={"font-black tracking-[-.04em] " + ((brand.initials?.length ?? 0) > 2 ? "text-[9px]" : "text-[11px]")}>
          {brand.initials}
        </span>
      )}
    </span>
  );
}
