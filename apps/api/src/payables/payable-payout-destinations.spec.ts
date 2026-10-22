import { AccountType, PayableStatus, RoleName } from '@prisma/client';
import { PayablesService } from './payables.service.js';

function fixture() {
 const payable={
  id:'payable1',customerId:'customer1',originalAmount:4000,remainingAmount:4000,
  paidAmount:0,status:PayableStatus.PENDING,
  dueAt:new Date('2026-10-25T12:00:00Z'),customer:{id:'customer1',fullName:'Arun'},
 };
 const tx:any={
  $queryRawUnsafe:vi.fn().mockResolvedValue([]),
  customerPayable:{findUnique:vi.fn().mockResolvedValue(payable),update:vi.fn().mockResolvedValue({})},
  customerCard:{findFirst:vi.fn().mockResolvedValue({
    id:'card1',customerId:'customer1',bankName:'KOTAK VISA',lastFourDigits:'0428',nickname:null,isActive:true,
  })},
  beneficiaryAccount:{findFirst:vi.fn().mockResolvedValue({
    id:'beneficiary1',bankName:'HDFC',accountType:'BANK',accountReference:'987654321123',
    beneficiary:{beneficiaryName:'Friend Raj'},
  })},
  customerBankAccount:{findFirst:vi.fn().mockResolvedValue(null)},
  customerUpiAccount:{findFirst:vi.fn().mockResolvedValue(null)},
  ledgerAccount:{findUnique:vi.fn().mockResolvedValue({id:'customer-liability'})},
  transaction:{create:vi.fn().mockResolvedValue({id:'transaction-new'})},
  payablePayment:{create:vi.fn().mockResolvedValue({id:'payment-new'})},
  auditLog:{create:vi.fn().mockResolvedValue({})},
 };
 const prisma:any={$transaction:vi.fn(async(handler:any)=>handler(tx))};
 const wallet:any={id:'wallet1',accountType:AccountType.PROVIDER_WALLET,providerId:'provider1',accountName:'wallet',ledgerAccount:{id:'wallet-ledger'}};
 const validation:any={lockAccount:vi.fn(),liquidAsset:vi.fn().mockResolvedValue(wallet),ensureSufficientFunds:vi.fn()};
 const ledger:any={post:vi.fn().mockResolvedValue({})};
 const idempotency:any={key:vi.fn().mockResolvedValue('same-key')};
 const charge:any={resolve:vi.fn().mockResolvedValue(null)};
 const service=new PayablesService(prisma,ledger,validation,idempotency,charge);
 const dto:any={amount:2500,sourceAccountId:'wallet1',destinationType:'CUSTOMER_CARD',destinationId:'card1',chargeAmount:0};
 return {service,tx,ledger,validation,dto};
}
describe('Payable payout destinations',()=>{
 it('records customer swipe card with masked details while wallet is debited just once',async()=>{
  const f=fixture();
  await f.service.pay('payable1',f.dto,'owner1',RoleName.OWNER,'stable-retry');
  expect(f.tx.customerCard.findFirst).toHaveBeenCalledWith({where:{id:'card1',customerId:'customer1',isActive:true}});
  expect(f.tx.payablePayment.create).toHaveBeenCalledWith({data:expect.objectContaining({
   destinationType:'CUSTOMER_CARD',destinationLabel:'KOTAK VISA ••••0428',
   destinationReference:'Card ending 0428',
   destinationDetails:{customerCardId:'card1',bankName:'KOTAK VISA',lastFourDigits:'0428'},
  })});
  expect(f.ledger.post).toHaveBeenCalledTimes(1);
  expect(f.ledger.post.mock.calls[0][4]).toEqual(expect.arrayContaining([
   expect.objectContaining({ledgerAccountId:'wallet-ledger',amount:2500}),
   expect.objectContaining({ledgerAccountId:'customer-liability',amount:2500}),
  ]));
 });
 it('rejects card IDs belonging to another customer before posting',async()=>{
  const f=fixture();f.tx.customerCard.findFirst.mockResolvedValue(null);
  await expect(f.service.pay('payable1',f.dto,'owner1',RoleName.OWNER)).rejects.toThrow('does not belong');
  expect(f.tx.payablePayment.create).not.toHaveBeenCalled();
 });
 it('records saved friend beneficiary with masked account reference',async()=>{
  const f=fixture();f.dto.destinationType='BENEFICIARY_ACCOUNT';f.dto.destinationId='beneficiary1';
  await f.service.pay('payable1',f.dto,'owner1',RoleName.OWNER);
  expect(f.tx.payablePayment.create).toHaveBeenCalledWith({data:expect.objectContaining({
   destinationLabel:'Friend Raj · HDFC ••••1123',
   destinationDetails:expect.objectContaining({beneficiaryAccountId:'beneficiary1',maskedReference:'••••1123'}),
  })});
 });
 it('accepts other card details with only last 4 digits',async()=>{
  const f=fixture();f.dto.destinationType='OTHER_CARD';delete f.dto.destinationId;
  f.dto.destinationDetails='Friend Meena / HDFC / 6587';
  await f.service.pay('payable1',f.dto,'owner1',RoleName.OWNER);
  expect(f.tx.payablePayment.create).toHaveBeenCalledWith({data:expect.objectContaining({
   destinationType:'OTHER_CARD',destinationLabel:'Other credit card · Friend Meena / HDFC / 6587',
  })});
 });
 it('blocks full card number, preventing financial posting',async()=>{
  const f=fixture();f.dto.destinationType='OTHER_CARD';delete f.dto.destinationId;
  f.dto.destinationDetails='Friend Meena 4242 4242 4242 4242';
  await expect(f.service.pay('payable1',f.dto,'owner1',RoleName.OWNER)).rejects.toThrow('last four');
  expect(f.tx.payablePayment.create).not.toHaveBeenCalled();
 });
 it('enforces cash-only source when paying out physical cash',async()=>{
  const f=fixture();f.dto.destinationType='CASH';delete f.dto.destinationId;
  await expect(f.service.pay('payable1',f.dto,'owner1',RoleName.OWNER)).rejects.toThrow('cash account');
  expect(f.tx.payablePayment.create).not.toHaveBeenCalled();
 });
});
