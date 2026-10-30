import { Prisma, type PrismaClient } from '@prisma/client';

/** Each word/number must match somewhere on the same customer or their saved details.
 * Search never requires an exact account number and never returns it in suggestions.
 */
export function customerSearchFilter(input: string): Prisma.CustomerWhereInput {
  const terms = input.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return {
    AND: terms.map((term): Prisma.CustomerWhereInput => {
      const digits = term.replace(/\D/g, '');
      const numeric = digits.length >= 2;
      const text = (value: string): Prisma.StringFilter => ({ contains: value, mode: 'insensitive' });
      const filters: Prisma.CustomerWhereInput[] = [
        { fullName: text(term) },
        { customerCode: text(term) },
        { ebNumber: text(term) },
        { serviceProfiles: { some: { isActive: true, serviceName: 'Eb Bill', OR: [{ referenceNumber: text(term) }, { nickname: text(term) }, { ownerName: text(term) }] } } },
        { esevaiServices: { some: { isActive: true, OR: [{ esevaiName: text(term) }, { serviceName: text(term) }] } } },
        { aepsAccounts: { some: { isActive: true, OR: [
          { bankName: text(term) }, { holderName: text(term) },
          ...(numeric ? [{ prNumber: { contains: digits } }, { aadhaarLastSix: { contains: digits } }] : []),
        ] } } },
        { cards: { some: { isActive: true, OR: [
          { bankName: text(term) }, { nickname: text(term) },
          ...(numeric ? [{ lastFourDigits: { contains: digits } }] : []),
        ] } } },
        { bankAccounts: { some: { isActive: true, OR: [
          { bankName: text(term) }, { accountHolderName: text(term) }, { ifsc: text(term) },
          ...(numeric ? [{ accountReference: { contains: digits } }] : []),
        ] } } },
        { upiAccounts: { some: { isActive: true, OR: [
          { accountName: text(term) }, { upiId: text(term) }, { providerName: text(term) },
          ...(numeric ? [{ mobileNumber: { contains: digits } }] : []),
        ] } } },
        { beneficiaries: { some: { isActive: true, OR: [
          { beneficiaryName: text(term) }, { relationshipNote: text(term) },
          { accounts: { some: { isActive: true, OR: [
            { bankName: text(term) }, { ifsc: text(term) }, { upiId: text(term) },
            ...(numeric ? [
              { accountReference: { contains: digits } },
              { mobileNumber: { contains: digits } },
            ] : []),
          ] } } },
        ] } } },
      ];
      if (numeric) filters.push({ mobile: { contains: digits } });
      // Existing AePS and Micro ATM last-four lookup must continue working.
      if (digits.length === 4) filters.push({ transactions: { some: { OR: [
        { aeps: { is: { aadhaarLastFour: { contains: digits } } } },
        { microAtm: { is: { cardLastFour: { contains: digits } } } },
      ] } } });
      return { OR: filters };
    }),
  };
}

/** Resolve customer IDs without putting unrelated EXISTS joins in the same OR.
 * PostgreSQL can take >1 second to plan/execute that combined query even for
 * small ledgers; independent indexed relations are much cheaper.
 */
export async function findCustomerIdsForSearch(
  prisma: Pick<PrismaClient, 'customer'>,
  input: string,
  includeInactive = false,
): Promise<string[]> {
  const activeOnly: Prisma.CustomerWhereInput = includeInactive ? {} : { isActive: true };
  const query = input.trim();
  // Complete Indian mobile numbers use the existing Customer.mobile B-tree
  // index. Keep the broad saved-details search as fallback if there is no
  // direct mobile match (e.g., the digits belong to a bank/UPI reference).
  if (/^\d{10}$/.test(query)) {
    const phoneMatches = await prisma.customer.findMany({
      where: { ...activeOnly, mobile: query },
      select: { id: true },
    });
    if (phoneMatches.length) return phoneMatches.map((row) => row.id);
  }
  const terms = customerSearchFilter(input).AND as Prisma.CustomerWhereInput[];
  let matches: Set<string> | undefined;
  for (const term of terms) {
    const clauses = (term.OR ?? []) as Prisma.CustomerWhereInput[];
    const isDirect = (clause: Prisma.CustomerWhereInput) =>
      ['fullName', 'customerCode', 'ebNumber', 'mobile'].some((key) => key in clause);
    const direct = clauses.filter(isDirect);
    const separateQueries: Prisma.CustomerWhereInput[] = [
      ...(direct.length ? [{ OR: direct }] : []),
      ...clauses.filter((clause) => !isDirect(clause)),
    ];
    const rows = await Promise.all(separateQueries.map((filter) =>
      prisma.customer.findMany({
        where: { ...activeOnly, ...filter },
        select: { id: true },
      }),
    ));
    const termMatches = new Set(rows.flat().map((row) => row.id));
    matches = matches ? new Set([...matches].filter((id) => termMatches.has(id))) : termMatches;
    if (!matches.size) break;
  }
  return [...(matches ?? [])];
}
