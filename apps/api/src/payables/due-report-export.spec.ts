import ExcelJS from 'exceljs';
import { PayablesController } from './payables.controller.js';
import { buildDueReport } from './due-report.js';

describe('Excel pending payable worklist', () => {
  it('exports three matching sheets with correct net customer payment', async () => {
    const now = new Date('2026-10-21T14:00:00+05:30');
    const report = buildDueReport([{
      id:'payable1', originalAmount:36860, paidAmount:10000, offsetAmount:500,
      remainingAmount:26360, dueAt:new Date('2026-10-21T09:00:00+05:30'),
      status:'PARTIALLY_PAID',
      customer:{id:'c1', fullName:'RAMESH', mobile:'9876543210'},
      paymentTerm:{name:'15 Days',durationValue:15,durationUnit:'DAYS'},
      sourceTransaction:{
        transactionNumber:'CCS-T1', transactionType:'CARD_SWIPE',
        transactionAt:new Date('2026-10-06T09:00:00+05:30'),
        cardSwipe:{
          swipeAmount:38000, commissionAmount:1140, commissionRate:3,
          providerChargeAmount:950, providerId:'provider-1',gatewayId:'gateway-2',
          customerCard:{bankName:'HDFC',lastFourDigits:'5264'},
        },
      },
    }],now, {providers:new Map([['provider-1','EZYPAY']]),gateways:new Map([['gateway-2','PG2']])});
    const mockService:any={dueReport:vi.fn().mockResolvedValue(report)};
    const response:any={setHeader:vi.fn(),end:vi.fn()};
    const controller=new PayablesController(mockService);
    await controller.downloadDueReport(response);
    expect(mockService.dueReport).toHaveBeenCalledWith({q:undefined,transactionType:undefined});
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const data=response.end.mock.calls[0][0] as Buffer;
    expect(data.length).toBeGreaterThan(4000);
    const book=new ExcelJS.Workbook();
    await book.xlsx.load(data);
    expect(book.worksheets.map(s=>s.name)).toEqual(['NET BALANCE','DATE WISE','PENDING DETAILS','CARD TOTALS','RAMESH']);
    const net=book.getWorksheet('NET BALANCE')!;
    expect(net.getCell('C9').value).toBe('PAYABLE');
    expect(net.getCell('D9').value).toBe('AMOUNT');
    expect(net.getCell('B11').value).toBe('EZYPAY / PG2');
    expect(net.getCell('D11').value).toBe(26360);
    expect(net.getCell('D12').value).toBe(26360);
    expect(net.getCell('D12').fill).toMatchObject({fgColor:{argb:'FF167A4C'}});
    expect(net.getCell('C11').fill).toMatchObject({fgColor:{argb:'FF5B368E'}});
    expect(net.pageSetup.orientation).toBe('landscape');
    expect(net.getCell('F11').value).toBe('15 DAYS');
    expect(book.getWorksheet('DATE WISE')?.getCell('K10').value).toBe(26360);
    expect(book.getWorksheet('PENDING DETAILS')?.getCell('I10').value).toBe(38000);
    expect(book.getWorksheet('PENDING DETAILS')?.getCell('K10').value).toBe(1140);
    expect(book.getWorksheet('PENDING DETAILS')?.getCell('L10').value).toBe(36860);
    expect(book.getWorksheet('PENDING DETAILS')?.getCell('O10').value).toBe(26360);
    expect(book.getWorksheet('PENDING DETAILS')?.getCell('P10').value).toBe(950);
    expect(book.getWorksheet('CARD TOTALS')?.getCell('K10').value).toBe(26360);
    expect(book.getWorksheet('RAMESH')?.getCell('D10').value).toBe(26360);
  });
});
