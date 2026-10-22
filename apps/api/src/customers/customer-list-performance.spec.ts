import { CustomersService } from './customers.service.js';

describe('Customer list payload', () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(41);
  const service = new CustomersService({ customer: { findMany, count } } as any, {} as any, {} as any, {} as any, {} as any);

  it('selects only the paginated customer list fields', async () => {
    const result = await service.list({ search: '987', page: 1, pageSize: 25 });
    const query = findMany.mock.lastCall?.[0];
    expect(query.select).toMatchObject({ fullName: true, mobile: true, customerCode: true,
      cards: { select: { id: true, isActive: true } } });
    expect(query.include).toBeUndefined();
    expect(query.select.bankAccounts).toBeUndefined();
    expect(query.select.beneficiaries).toBeUndefined();
    expect(result.pagination.total).toBe(41);
  });

  it('keeps the richer unpaged response for other screens', async () => {
    await service.list();
    const query = findMany.mock.lastCall?.[0];
    expect(query.include).toMatchObject({ bankAccounts: true, upiAccounts: true,
      beneficiaries: { include: { accounts: true } } });
  });

  it('unions matches across saved fields and intersects multiple search terms', async () => {
    findMany.mockImplementation(async ({ where, select }: any) => {
      if (!select || Object.keys(select).join(',') !== 'id') return [];
      const filter = JSON.stringify(where);
      if (filter.includes('TMB')) {
        if (where.cards) return [{ id: 'c' }];
        if (where.OR) return [{ id: 'a' }, { id: 'b' }];
      }
      if (filter.includes('0247')) {
        if (where.bankAccounts) return [{ id: 'b' }];
        if (where.OR) return [{ id: 'a' }, { id: 'd' }];
      }
      return [];
    });
    count.mockResolvedValueOnce(2);
    try {
      const result = await service.list({ search: 'TMB 0247', page: 1 });
      const query = findMany.mock.lastCall?.[0];
      expect(query.where.isActive).toBe(true);
      expect(query.where.id.in).toEqual(['a', 'b']);
      expect(result.pagination.total).toBe(2);
    } finally {
      findMany.mockReset().mockResolvedValue([]);
    }
  });

  it('stops searching further words after a term has no matches', async () => {
    const before = findMany.mock.calls.length;
    const result = await service.list({ search: 'unlikely first second', page: 1 });
    const queries = findMany.mock.calls.slice(before);
    const finalQuery = queries.at(-1)?.[0];
    expect(finalQuery.where.id.in).toEqual([]);
    expect(queries.length).toBeLessThan(25);
    expect(result.items).toEqual([]);
  });
});
