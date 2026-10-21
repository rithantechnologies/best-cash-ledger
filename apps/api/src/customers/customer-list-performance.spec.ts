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
});
