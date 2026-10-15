import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { ExcelExportService } from './excel-export.service.js';
import { exportPeriod, excelText, signedAccountMovement } from './excel-export.helpers.js';

describe('Excel export date range, safety and accounting rules', () => {
  it('treats the entire selected India business date as included', () => {
    const period = exportPeriod('2026-10-01','2026-10-15','all');
    expect(period.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(period.end.toISOString()).toBe('2026-10-15T18:30:00.000Z');
    expect(period.dayStart.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(period.dayEnd.toISOString()).toBe('2026-10-16T00:00:00.000Z');
  });
  it('rejects invalid dates, reverse dates and unknown sections', () => {
    expect(()=>exportPeriod('2026-02-30','2026-03-01','all')).toThrow();
    expect(()=>exportPeriod('2026-10-16','2026-10-15','all')).toThrow();
    expect(()=>exportPeriod('2026-10-01','2026-10-15','private')).toThrow();
    expect(()=>exportPeriod('2026-10-01','2026-10-15','cash')).not.toThrow();
  });
  it('makes spreadsheet formula-looking input plain text', () => {
    for(const input of ['=1+1','+SUM(A1:A2)','-1+2','@HYPERLINK("x")','\t=1+1'])
      expect(excelText(input).startsWith("'")).toBe(true);
    expect(excelText('Normal Name')).toBe('Normal Name');
    expect(excelText(null)).toBe('');
  });
  it('normalizes asset vs liability debit and credit movements', () => {
    expect(signedAccountMovement('ASSET','DEBIT',100)).toBe(100);
    expect(signedAccountMovement('ASSET','CREDIT',100)).toBe(-100);
    expect(signedAccountMovement('LIABILITY','DEBIT',100)).toBe(-100);
    expect(signedAccountMovement('LIABILITY','CREDIT',100)).toBe(100);
  });
});

describe('Excel output is a valid workbook, not a CSV', () => {
  it('builds every worksheet even with no transactions in the date range', async () => {
    const empty = vi.fn().mockResolvedValue([]);
    const db = {
      user: { findMany: empty }, financialAccount: { findMany: empty },
      provider: { findMany: empty }, providerGateway: { findMany: empty },
      transaction: { findMany: empty },
      ledgerEntry: { groupBy: empty, findMany: empty },
      cashSession: { findMany: empty }, payablePayment: { findMany: empty },
      cardDueRecovery: { findMany: empty }, cardDueCommissionCollection: { findMany: empty },
      customerPayable: { findMany: empty }, customerReceivable: { findMany: empty },
      receivableCollection: { findMany: empty }, dailyPositionSummary: { findMany: empty },
      providerSettlement: { findMany: empty }, providerSettlementReceipt: { findMany: empty },
      customer: { findMany: empty }, auditLog: { findMany: empty },
    };
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      $transaction: vi.fn().mockImplementation((f: (arg: typeof db) => unknown) => f(db)),
      auditLog: { create },
    };
    const service = new ExcelExportService(prisma as never);
    const stream = new PassThrough() as PassThrough & {
      setHeader: (key: string, value: string) => void;
      destroy: (error?: Error) => PassThrough;
    };
    const headers: Record<string,string>={};
    stream.setHeader = (key,value) => { headers[key]=value; };
    const chunks: Buffer[]=[];
    stream.on('data',(chunk:Buffer)=>chunks.push(chunk));
    await service.write(stream as never,'2026-10-01','2026-10-15','all','user-1');
    const result = new ExcelJS.Workbook();
    await result.xlsx.load(Buffer.concat(chunks) as never);
    expect(result.worksheets.length).toBeGreaterThan(20);
    expect(result.getWorksheet('Master Transactions')?.getCell('B1').value).toBe('Transaction');
    expect(result.getWorksheet('Daily Cash Book')?.getCell('G1').value).toBe('Cash In');
    expect(result.getWorksheet('End of Day')?.getCell('A1').value).toBe('Business Date');
    expect(result.getWorksheet('Master Transactions')?.rowCount).toBe(1);
    expect(result.getWorksheet('Summary')?.getCell('B5').value).toBe(0);
    expect(headers['Content-Type']).toContain('spreadsheetml.sheet');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('Full-period export completeness', () => {
  it('continues past 1,000 transactions instead of silently truncating the workbook', async () => {
    const when = new Date('2026-10-14T06:30:00.000Z');
    const data = Array.from({length:1001},(_,i)=>({
      id:'txn-'+String(i).padStart(4,'0'),
      transactionNumber:'T-'+String(i).padStart(4,'0'),
      transactionAt:when, createdAt:when, updatedAt:when,
      transactionType:'CASH_TRANSFER',status:'COMPLETED',
      grossAmount:100, netAmount:100, customer:null,createdById:'owner',
      charges:[],commissions:[],referenceNumber:null,notes:null,
    }));
    const empty=vi.fn().mockResolvedValue([]);
    const transactionQuery=vi.fn().mockImplementation(async (opts:{cursor?:{id:string},take:number})=>{
      const start=opts.cursor?data.findIndex(row=>row.id===opts.cursor?.id)+1:0;
      return data.slice(start,start+opts.take);
    });
    const db={
      user:{findMany:empty},financialAccount:{findMany:empty},
      provider:{findMany:empty},providerGateway:{findMany:empty},
      transaction:{findMany:transactionQuery},
      ledgerEntry:{groupBy:empty,findMany:empty},cashSession:{findMany:empty},
      payablePayment:{findMany:empty},cardDueRecovery:{findMany:empty},
      cardDueCommissionCollection:{findMany:empty},customerPayable:{findMany:empty},
      customerReceivable:{findMany:empty},receivableCollection:{findMany:empty},
      dailyPositionSummary:{findMany:empty},providerSettlement:{findMany:empty},
      providerSettlementReceipt:{findMany:empty},customer:{findMany:empty},
      auditLog:{findMany:empty},
    };
    const prisma={$transaction:(fn:(v:typeof db)=>Promise<void>)=>fn(db),auditLog:{create:vi.fn()}};
    const service=new ExcelExportService(prisma as never);
    const stream=new PassThrough() as PassThrough & {setHeader:(k:string,v:string)=>void};
    stream.setHeader=()=>{};
    const chunks:Buffer[]=[];
    stream.on('data',(chunk:Buffer)=>chunks.push(chunk));
    await service.write(stream as never,'2026-10-14','2026-10-14','all');
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.concat(chunks) as never);
    expect(transactionQuery).toHaveBeenCalledTimes(3);
    expect(wb.getWorksheet('Master Transactions')?.rowCount).toBe(1002);
    expect(wb.getWorksheet('Summary')?.getCell('B5').value).toBe(1001);
  });
});
