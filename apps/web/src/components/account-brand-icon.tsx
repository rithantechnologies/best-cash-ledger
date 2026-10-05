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
  aliases: string[];
  numericSuffixAliases?: string[];
};

const assetBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

const normalize = (value: string | null | undefined) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function aliasMatches(value: string, alias: string, allowNumericSuffix = false) {
  const normalizedAlias = normalize(alias);
  if (!normalizedAlias) return false;
  if (value === normalizedAlias || value.startsWith(normalizedAlias + " ")) return true;
  if (allowNumericSuffix && value.startsWith(normalizedAlias)) {
    const suffix = value.slice(normalizedAlias.length);
    return /^\d/.test(suffix);
  }
  return false;
}

function findBrand(value: string, rules: BrandRule[]) {
  return rules.find((rule) =>
    rule.aliases.some((alias) =>
      aliasMatches(value, alias, rule.numericSuffixAliases?.includes(alias) ?? false),
    ),
  );
}

const genericBank = (label: string, initials: string): AccountBrand => ({
  label,
  initials,
  background: "#edf5ff",
  foreground: "#315f9f",
});

const bankRules: BrandRule[] = [
  { label: "State Bank of India", image: "/account-brands/sbi.png", aliases: ["SBI", "STATE BANK OF INDIA"], background: "#eaf7ff", foreground: "#00a9e0" },
  { label: "HDFC Bank", initials: "HDFC", aliases: ["HDFC", "HDFC BANK"], background: "#eef4ff", foreground: "#004c8f" },
  { label: "ICICI Bank", image: "/account-brands/icici.png", aliases: ["ICICI", "ICICI BANK"], background: "#fff2e9", foreground: "#b02a30" },
  { label: "Axis Bank", image: "/account-brands/axis.png", aliases: ["AXIS", "AXIS BANK"], background: "#fff0f5", foreground: "#97144d" },
  { label: "Kotak Mahindra Bank", initials: "KMB", aliases: ["KOTAK", "KOTAK MAHINDRA BANK"], background: "#fff0f0", foreground: "#ed1c24" },
  { label: "IndusInd Bank", image: "/account-brands/indusind.png", aliases: ["INDUSIND", "INDUS", "INDUSIND BANK"], numericSuffixAliases: ["INDUS"], background: "#fff0ef", foreground: "#a73a36" },
  { label: "YES Bank", initials: "YES", aliases: ["YES", "YES BANK"], background: "#eef6ff", foreground: "#0057a8" },
  { label: "IDFC FIRST Bank", initials: "IDFC", aliases: ["IDFC", "IDFC FIRST", "IDFC FIRST BANK"], background: "#fff1f3", foreground: "#9b1c31" },
  { label: "Federal Bank", initials: "FB", aliases: ["FEDERAL", "FEDERAL BANK"], background: "#edf7ff", foreground: "#0066a1" },
  { label: "RBL Bank", initials: "RBL", aliases: ["RBL", "RBL BANK"], background: "#fff3eb", foreground: "#f26522" },
  { label: "AU Small Finance Bank", initials: "AU", aliases: ["AU", "AU SMALL FINANCE BANK"], background: "#fff5eb", foreground: "#f58220" },
  { label: "Bandhan Bank", initials: "BB", aliases: ["BANDHAN", "BANDHAN BANK"], background: "#fff0f3", foreground: "#b3134a" },
  { label: "Bank of Baroda", image: "/account-brands/bank-of-baroda.png", aliases: ["BOB", "BANK OF BARODA"], background: "#fff4e7", foreground: "#f26522" },
  { label: "Bank of India", image: "/account-brands/boi.png", aliases: ["BOI", "BANK OF INDIA"], background: "#fff5e8", foreground: "#005baa" },
  { label: "Bank of Maharashtra", initials: "BOM", aliases: ["BOM", "BANK OF MAHARASHTRA"], background: "#eef6ff", foreground: "#1f4f8f" },
  { label: "Canara Bank", image: "/account-brands/canara.png", aliases: ["CANARA", "CANARA BANK"], background: "#edf9ff", foreground: "#009fe3" },
  { label: "Central Bank of India", initials: "CBI", aliases: ["CBI", "CENTRAL BANK OF INDIA"], background: "#eef6ff", foreground: "#21409a" },
  { label: "Indian Overseas Bank", initials: "IOB", aliases: ["IOB", "INDIAN OVERSEAS", "INDIAN OVERSEAS BANK"], background: "#eaf0ff", foreground: "#003f98" },
  { label: "South Indian Bank", image: "/account-brands/south-indian-bank.png", imageClass: "h-12 w-auto max-w-none justify-self-start", aliases: ["SIB", "SOUTH INDIAN", "SOUTH INDIAN BANK", "THE SOUTH INDIAN BANK"], background: "#fff3f3", foreground: "#b20d2f" },
  { label: "Indian Bank", image: "/account-brands/indian-bank.jpg", aliases: ["INDIAN", "INDIAN BANK"], background: "#fff4d8", foreground: "#0055a5" },
  { label: "Punjab National Bank", initials: "PNB", aliases: ["PNB", "PUNJAB NATIONAL BANK"], background: "#fff7e5", foreground: "#9b1b30" },
  { label: "Punjab & Sind Bank", initials: "PSB", aliases: ["PSB", "PUNJAB SIND BANK", "PUNJAB AND SIND BANK"], background: "#eef6ff", foreground: "#0057a8" },
  { label: "UCO Bank", initials: "UCO", aliases: ["UCO", "UCO BANK"], background: "#eef6ff", foreground: "#005a9c" },
  { label: "Union Bank of India", image: "/account-brands/union-bank-of-india.png", aliases: ["UBI", "UNION BANK", "UNION BANK OF INDIA"], background: "#f1f7ff", foreground: "#0057a8" },
  { label: "Karur Vysya Bank", initials: "KVB", aliases: ["KVB", "KARUR VYSYA", "KARUR VYSYA BANK"], background: "#f6f7a5", foreground: "#007a4d" },
  { label: "Karnataka Bank", initials: "KBL", aliases: ["KBL", "KARNATAKA BANK"], background: "#fff4e8", foreground: "#a54716" },
  { label: "City Union Bank", image: "/account-brands/city-union-bank.jpg", aliases: ["CUB", "CITY UNION", "CITY UNION BANK"], background: "#f5f4ff", foreground: "#312e81" },
  { label: "Tamilnad Mercantile Bank", initials: "TMB", aliases: ["TMB", "TAMILNAD MERCANTILE", "TAMILNAD MERCANTILE BANK"], background: "#fff5e8", foreground: "#a33b17" },
  { label: "DCB Bank", initials: "DCB", aliases: ["DCB", "DCB BANK"], background: "#eef7ff", foreground: "#005c8f" },
  { label: "CSB Bank", initials: "CSB", aliases: ["CSB", "CSB BANK", "CATHOLIC SYRIAN BANK"], background: "#fff1f1", foreground: "#a11217" },
  { label: "Airtel Payments Bank", image: "/account-brands/airtel-payments-bank.png", aliases: ["AIRTEL", "AIRTEL PAYMENTS BANK", "MITRA AIRTEL"], background: "#fff0f0", foreground: "#e40000" },
  { label: "Fino Payments Bank", image: "/account-brands/fino.png", aliases: ["FINO", "FINO PAYMENTS BANK", "MITRA FINO"], background: "#fff0f1", foreground: "#ef3340" },
];

const walletRules: BrandRule[] = [
  { label: "PhonePe", image: "/account-brands/phonepe.png", aliases: ["PHONEPE", "PHONE PE"], background: "#f2eafd", foreground: "#5f259f" },
  { label: "BANKIT", image: "/account-brands/bankit.png", aliases: ["BANKIT"], background: "#eaf8ff", foreground: "#00a9e0" },
  { label: "ROINET", image: "/account-brands/roinet.png", aliases: ["ROINET"], background: "#f4f7ff", foreground: "#194e9d" },
  { label: "SriMoney", image: "/account-brands/srimoney.png", aliases: ["SRIMONEY", "SRI MONEY"], background: "#eefaff", foreground: "#149cc4" },
  { label: "DigiSeva", image: "/account-brands/digiseva.svg", imageClass: "h-6 w-8 object-contain", aliases: ["DIGISEVA", "DIGI SEVA"], background: "#f6f8ff", foreground: "#3b3fa2" },
  { label: "PaySwitch", initials: "PS", aliases: ["PAYSWITCH", "PAY SWITCH"], background: "#eef6ff", foreground: "#1d4f91" },
  { label: "24PAY", image: "/account-brands/24pay.png", imageClass: "h-6 w-8 object-contain", aliases: ["24PAY", "24 PAY"], background: "#f4f5ff", foreground: "#5b5cf0" },
  { label: "A2Z Suvidhaa", image: "/account-brands/a2z-suvidhaa.jpg", imageClass: "h-7 w-auto max-w-none justify-self-start -translate-x-1", aliases: ["A2Z", "A2Z SUVITHA", "A2Z SUVIDHAA"], background: "#fff8ef", foreground: "#e77724" },
  { label: "Easy Pay", image: "/account-brands/easypay.png", imageClass: "h-5 w-8 object-contain", aliases: ["EASYPAY", "EASY PAY"], background: "#f4f7fb", foreground: "#0057a8" },
  { label: "Swift Money", image: "/account-brands/swift-money.jpg", imageClass: "h-6 w-8 object-contain", aliases: ["SWIFT MONEY"], background: "#f5f8ff", foreground: "#174d8a" },
  { label: "RD Wallet", initials: "RD", aliases: ["RD"], background: "#f2f4f7", foreground: "#344054" },
  { label: "Praveen BOB", image: "/account-brands/bank-of-baroda.png", aliases: ["PRAVEEN BOB"], background: "#fff4e7", foreground: "#f26522" },
];

const cardNetworkRules: BrandRule[] = [
  { label: "Visa", initials: "VISA", aliases: ["VISA"], background: "#edf2ff", foreground: "#1434cb" },
  { label: "Mastercard", initials: "MC", aliases: ["MASTERCARD", "MASTER CARD"], background: "#fff1ea", foreground: "#eb001b" },
  { label: "RuPay", initials: "RP", aliases: ["RUPAY"], background: "#edf8f2", foreground: "#1a7744" },
  { label: "American Express", initials: "AMEX", aliases: ["AMEX", "AMERICAN EXPRESS"], background: "#eef7ff", foreground: "#006fcf" },
];

function accountText(account: AccountBrandLike) {
  return normalize([account.bankName, account.accountName].filter(Boolean).join(" "));
}

function fallbackInitials(account: AccountBrandLike) {
  const generic = new Set(["WALLET", "BANK", "ACCOUNT", "CARD", "CREDIT", "OWNER", "AC", "CC"]);
  const words = normalize(account.accountName)
    .split(/\s+/)
    .filter((word) => word && !generic.has(word));
  if (!words.length) {
    if (account.accountType === "OWNER_CREDIT_CARD") return "CC";
    if (account.accountType === "PROVIDER_WALLET") return "W";
    return "B";
  }
  if (words[0].length <= 4 && /\d/.test(words[0])) return words[0].slice(0, 4);
  if (words.length === 1) return words[0].slice(0, 4);
  return (words[0][0] + words[1][0]).slice(0, 3);
}

function resolveBank(account: AccountBrandLike): AccountBrand {
  const matched = findBrand(accountText(account), bankRules);
  return matched ?? genericBank(account.bankName || account.accountName, fallbackInitials(account));
}

function resolveWallet(account: AccountBrandLike): AccountBrand {
  const matched = findBrand(normalize(account.accountName), walletRules);
  return matched ?? {
    label: account.accountName,
    initials: fallbackInitials(account),
    background: "#ebfaf4",
    foreground: "#117a5b",
  };
}

function resolveCard(account: AccountBrandLike): AccountBrand {
  const value = accountText(account);
  const bank = findBrand(value, bankRules);
  if (bank) return bank;
  const network = findBrand(value, cardNetworkRules);
  if (network) return network;
  return {
    label: account.bankName || account.accountName,
    initials: fallbackInitials(account),
    background: "#fff0f2",
    foreground: "#c2415d",
  };
}

export function accountBrand(account: AccountBrandLike): AccountBrand {
  if (account.accountType === "PROVIDER_WALLET") return resolveWallet(account);
  if (account.accountType === "OWNER_CREDIT_CARD") return resolveCard(account);
  if (account.accountType === "BANK" || account.accountType === "UPI") return resolveBank(account);
  return genericBank(account.bankName || account.accountName, fallbackInitials(account));
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
        <span className={"font-black tracking-[-.04em] " + ((brand.initials?.length ?? 0) > 3 ? "text-[8px]" : (brand.initials?.length ?? 0) > 2 ? "text-[9px]" : "text-[11px]")}>
          {brand.initials}
        </span>
      )}
    </span>
  );
}
