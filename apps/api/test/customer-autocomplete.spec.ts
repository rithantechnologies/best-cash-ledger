import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from '../src/customers/customers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

function fixture() {
  const findMany = vi.fn().mockResolvedValue([
    { id: 'one', fullName: 'RAJU', mobile: '9912345678', customerCode: 'CUS-1', customerType: 'REGULAR' },
  ]);
  const service = new CustomersService({ customer: { findMany } } as unknown as PrismaService);
  return { service, findMany };
}

describe('customer autocomplete', () => {
  it('suggests active mobile numbers after just two digits, including Indian prefixes', async () => {
    const { service, findMany } = fixture();
    const matches = await service.autocomplete('99', 'mobile');
    expect(matches[0].mobile).toBe('9912345678');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isActive: true,
        OR: [
          { mobile: { startsWith: '99' } },
          { mobile: { startsWith: '+9199' } },
          { mobile: { startsWith: '9199' } },
        ],
      },
      take: 100,
    }));
  });

  it('matches name prefixes regardless of case', async () => {
    const { service, findMany } = fixture();
    await service.autocomplete('ra', 'name');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, fullName: { startsWith: 'ra', mode: 'insensitive' } },
    }));
  });

  it('avoids broad lookup for a single character or an unknown field', async () => {
    const { service, findMany } = fixture();
    expect(await service.autocomplete('9', 'mobile')).toEqual([]);
    expect(await service.autocomplete('ra', 'unknown')).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
