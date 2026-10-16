import { Prisma } from '@prisma/client';

/** Each word/number must match somewhere on the same customer or their saved details.
 * Search never requires an exact account number and never returns it in suggestions.
 */
export function customerSearchFilter(input: string): Prisma.CustomerWhereInput {
  const terms = input.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  return {
    AND: terms.map((term): Prisma.CustomerWhereInput => {
      const digits = term.replace(/\D/g, '');
      const numeric = digits.length >= 3;
      const text = (value: string): Prisma.StringFilter => ({ contains: value, mode: 'insensitive' });
      const filters: Prisma.CustomerWhereInput[] = [
        { fullName: text(term) },
        { customerCode: text(term) },
        { ebNumber: text(term) },
        { serviceProfiles: { some: { isActive: true, serviceName: 'Eb Bill', OR: [{ referenceNumber: text(term) }, { nickname: text(term) }, { ownerName: text(term) }] } } },
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
