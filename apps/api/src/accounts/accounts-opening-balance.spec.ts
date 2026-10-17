import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

function fixture(options:{financialActivity?:boolean;initial?:number}={}) {
  const balance=options.initial??0;
  const saved={id:'account-1',accountName:'Main Cash Reserve',accountType:'CASH',
    openingBalance:new Prisma.Decimal(balance),ledgerAccount:{id:'ledger-1'}};
  const tx:any={
    $queryRawUnsafe:vi.fn().mockResolvedValue([{id:'account-1'}]),
    financialAccount:{
      findUnique:vi.fn().mockResolvedValue(saved),
      update:vi.fn(async ({data}:any)=>({...saved,...data})),
    },
    transaction:{count:vi.fn().mockResolvedValue(options.financialActivity?1:0)},
    cashSession:{count:vi.fn().mockResolvedValue(0)},
    ledgerEntry:{count:vi.fn().mockResolvedValue(0)},
    dailyAccountBalance:{count:vi.fn().mockResolvedValue(0)},
    providerSettlement:{count:vi.fn().mockResolvedValue(0)},
    customerPayable:{count:vi.fn().mockResolvedValue(0)},
    customerReceivable:{count:vi.fn().mockResolvedValue(0)},
    auditLog:{create:vi.fn().mockResolvedValue({id:'audit-1'})},
  };
  const db:any={$transaction:vi.fn(async (work:any)=>work(tx)),financialAccount:{findFirst:vi.fn()}};
  return {service:new AccountsService(db,{} as any),db,tx};
}

describe('Owner-only starting balances',()=>{
  it('allows Owner to set an existing cash opening with a single audited change',async()=>{
    const {service,tx}=fixture();
    const result=await service.setOpeningBalance('account-1',{openingBalance:50000},'owner-1');
    expect(result.openingBalance.toString()).toBe('50000');
    expect(tx.financialAccount.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({
      userId:'owner-1',entityType:'FINANCIAL_ACCOUNT',action:'SET_OPENING_BALANCE',
      oldValues:{openingBalance:'0'},
      newValues:expect.objectContaining({openingBalance:'50000'})
    })});
  });
  it('does not create duplicate audit entries if amount is unchanged',async()=>{
    const {service,tx}=fixture({initial:50000});
    const result=await service.setOpeningBalance('account-1',{openingBalance:50000},'owner-1');
    expect(result.openingBalance.toString()).toBe('50000');
    expect(tx.financialAccount.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('blocks opening edits when financial activity exists anywhere in the business',async()=>{
    const {service,tx}=fixture({financialActivity:true});
    await expect(service.setOpeningBalance('account-1',{openingBalance:50000},'owner-1'))
      .rejects.toThrow(BadRequestException);
    expect(tx.financialAccount.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it('blocks Admin from entering an opening amount during account creation',async()=>{
    const {service,db}=fixture();
    await expect(service.create({
      accountName:'Bank',accountType:'BANK',accountNature:'ASSET',usageType:'BUSINESS',
      openingBalance:5000,
    } as any,'admin-1',RoleName.ADMIN)).rejects.toThrow(ForbiddenException);
    expect(db.financialAccount.findFirst).not.toHaveBeenCalled();
  });
  it('permits zero-opening account creation by Admin (preliminary validation)',async()=>{
    const {service,db}=fixture();
    await expect(service.create({
      accountName:'',accountType:'BANK',accountNature:'ASSET',usageType:'BUSINESS',
      openingBalance:0,
    } as any,'admin-1',RoleName.ADMIN)).rejects.toThrow('Account name is required');
    expect(db.financialAccount.findFirst).not.toHaveBeenCalled();
  });
  it('protects dedicated opening endpoint with Owner-only role metadata',()=>{
    const roles=Reflect.getMetadata('roles',AccountsController.prototype.setOpeningBalance);
    expect(roles).toEqual([RoleName.OWNER]);
  });
});
