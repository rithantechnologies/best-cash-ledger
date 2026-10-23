import { buildDueReport, type DuePayableInput } from './due-report.js';

const card = (opts: {
  id: string; due: string; swipeDate?: string; customer: string; card?: string;
  swipe: number; commission: number; paid?: number; advance?: number;
  remaining?: number; status?: string;
}): DuePayableInput => ({
  id:opts.id, originalAmount:opts.swipe-opts.commission,
  paidAmount:opts.paid??0, offsetAmount:opts.advance??0,
  remainingAmount:opts.remaining??opts.swipe-opts.commission-(opts.paid??0)-(opts.advance??0),
  dueAt:new Date(opts.due+'T12:00:00+05:30'),status:opts.status??'PENDING',
  customer:{id:opts.customer,fullName:opts.customer==='c1'?'Ramesh':'Meena',mobile:'9876543210'},
  paymentTerm:{name:'15 Days',durationValue:15,durationUnit:'DAYS'},
  sourceTransaction:{
    transactionNumber:'CCS-'+opts.id,transactionType:'CARD_SWIPE',
    transactionAt:new Date((opts.swipeDate??'2026-10-01')+'T11:00:00+05:30'),
    cardSwipe:{
      swipeAmount:opts.swipe,commissionAmount:opts.commission,commissionRate:3,
      providerChargeAmount:opts.swipe*0.025,
      customerCard:{bankName:'HDFC',lastFourDigits:opts.card??'5264'},
    },
  },
});
describe('date-wise pending payouts in INR',()=>{
  const now=new Date('2026-10-21T12:30:00+05:30');
  const payables=[
    card({id:'overdue',due:'2026-10-18',customer:'c1',swipe:10000,commission:300,paid:3000,advance:2000}),
    card({id:'today1',due:'2026-10-21',customer:'c1',swipe:20000,commission:600}),
    card({id:'today2',due:'2026-10-21',customer:'c2',swipe:5000,commission:150,paid:1850}),
    card({id:'paid',due:'2026-10-21',customer:'c1',swipe:1000,commission:30,paid:970,remaining:0,status:'PAID'}),
  ];
  it('shows only outstanding payables; excludes fully settled and zero remaining',()=>{
    const report=buildDueReport(payables,now);
    expect(report.rows.map(r=>r.transactionNumber)).toEqual(['CCS-overdue','CCS-today2','CCS-today1']);
    expect(report.totals.itemCount).toBe(3);
    expect(report.totals.customerCount).toBe(2);
    expect(report.totals.overdue).toBe(4700);
    expect(report.totals.today).toBe(22400);
    expect(report.totals.outstanding).toBe(27100);
    expect(report.totals.upcoming).toBe(0);
  });
  it('groups by due date first and preserves card/swipe breakdown and total due',()=>{
    const report=buildDueReport(payables,now);
    expect(report.dates).toHaveLength(2);
    expect(report.dates[0]).toMatchObject({
      date:'2026-10-18',status:'OVERDUE',itemCount:1,remaining:4700,
      grossSwipe:10000,customerCharges:300,netPayable:9700,paid:3000,advance:2000,
    });
    expect(report.dates[1]).toMatchObject({
      date:'2026-10-21',status:'TODAY',itemCount:2,customerCount:2,
      remaining:22400,grossSwipe:25000,customerCharges:750,
    });
    expect(report.cards.length).toBe(2);
    expect(report.cards.find(c=>c.customer==='Ramesh')?.remaining).toBe(24100);
    const row=report.rows[0];
    expect(row).toMatchObject({
      swipeDate:'2026-10-01',dueDate:'2026-10-18',termDays:15,
      grossSwipe:10000,customerCharges:300,gatewayCharge:250,
      netPayable:9700,paid:3000,advance:2000,remaining:4700,
    });
  });
  it('treats gateway charges as business costs and never deducts them from net customer payout',()=>{
    const report=buildDueReport([card({id:'pg2',due:'2026-10-22',customer:'c1',swipe:38000,commission:1140})],now);
    expect(report.rows[0].netPayable).toBe(36860);
    expect(report.rows[0].gatewayCharge).toBe(950);
    expect(report.totals.outstanding).toBe(36860);
  });
  it('preserves hour terms as hours, not fractional days, without changing due dates or money',()=>{
    const oneHour=card({id:'one-hour',due:'2026-10-23',customer:'c1',swipe:40000,commission:360});
    oneHour.paymentTerm={name:'Instant',durationValue:1,durationUnit:'HOURS'};
    const threeHours=card({id:'three-hours',due:'2026-10-23',customer:'c1',swipe:29600,commission:592});
    threeHours.paymentTerm={name:'INSTANT',durationValue:3,durationUnit:'HOURS'};
    const twentyFourHours=card({id:'twenty-four-hours',due:'2026-10-24',customer:'c1',swipe:1000,commission:10});
    twentyFourHours.paymentTerm={name:'24 Hours',durationValue:24,durationUnit:'HOURS'};
    const fourDays=card({id:'four-days',due:'2026-10-27',customer:'c1',swipe:1000,commission:10});
    fourDays.paymentTerm={name:'4DAYS',durationValue:4,durationUnit:'DAYS'};
    const custom=card({id:'custom',due:'2026-10-28',customer:'c1',swipe:1000,commission:10});
    custom.paymentTerm=null;
    const report=buildDueReport([oneHour,threeHours,twentyFourHours,fourDays,custom],new Date('2026-10-23T11:00:00+05:30'));
    const terms=new Map(report.rows.map(r=>[r.id,r]));
    expect(terms.get('one-hour')).toMatchObject({term:'Instant',termLabel:'1 HOUR',termDays:null,dueDate:'2026-10-23',remaining:39640});
    expect(terms.get('three-hours')).toMatchObject({termLabel:'3 HOURS',termDays:null,remaining:29008});
    expect(terms.get('twenty-four-hours')).toMatchObject({termLabel:'24 HOURS',termDays:null});
    expect(terms.get('four-days')).toMatchObject({termLabel:'4 DAYS',termDays:4});
    expect(terms.get('custom')).toMatchObject({termLabel:'Custom',termDays:null});
    expect(report.totals.outstanding).toBe(71618);
    expect(report.totals.itemCount).toBe(5);
  });
  it('uses Asia/Kolkata day even when UTC date is the previous day',()=>{
    const report=buildDueReport([
      card({id:'midnight',due:'2026-10-21',customer:'c1',swipe:1000,commission:30}),
    ], new Date('2026-10-20T19:30:00Z'));
    expect(report.businessDate).toBe('2026-10-21');
    expect(report.totals.today).toBe(970);
  });
});
