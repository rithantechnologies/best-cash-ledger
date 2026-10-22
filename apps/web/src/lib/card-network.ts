// A saved card network takes priority. Never silently assign Visa to an
// existing card whose network was never recorded.
export type SavedCardNetwork = {
  cardNetworkId?: string | null;
  bankName?: string | null;
  nickname?: string | null;
};
export type NetworkOption = { id: string; name: string; isActive?: boolean };

function explicitlyNamedNetwork(text: string): string | null {
  const normalized = text.toLowerCase();
  const matches = [
    /\bmaster(?:\s*card)?\b/.test(normalized) ? "mastercard" : null,
    /\bvisa\b/.test(normalized) ? "visa" : null,
    /\bru\s*pay\b/.test(normalized) ? "rupay" : null,
    /\b(?:amex|american\s*express)\b/.test(normalized) ? "amex" : null,
    /\bmaestro\b/.test(normalized) ? "maestro" : null,
    /\bdiners(?:\s*club)?\b/.test(normalized) ? "diners" : null,
  ].filter((value): value is string => value !== null);
  return matches.length === 1 ? matches[0] : null;
}

function standardNetworkName(name: string): string | null {
  const normalized = name.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "mastercard" || normalized === "master") return "mastercard";
  if (normalized === "visa") return "visa";
  if (normalized === "rupay") return "rupay";
  if (normalized === "amex" || normalized === "americanexpress") return "amex";
  if (normalized === "maestro") return "maestro";
  if (normalized === "diners" || normalized === "dinersclub") return "diners";
  return null;
}

export function networkForSavedCard(
  card: SavedCardNetwork | null | undefined,
  networks: NetworkOption[],
  historicNetworkId?: string | null,
): string {
  if (!card) return "";
  const active = networks.filter(network => network.isActive !== false);
  for (const id of [card.cardNetworkId, historicNetworkId]) {
    if (id && active.some(network => network.id === id)) return id;
  }
  // Some imported cards encode their network in the bank label (e.g. ICICI MASTER).
  // Only recognize unambiguous network words. Never infer from the bank itself.
  const explicit = explicitlyNamedNetwork(card.bankName ?? "");
  return active.find(network => standardNetworkName(network.name) === explicit)?.id ?? "";
}
