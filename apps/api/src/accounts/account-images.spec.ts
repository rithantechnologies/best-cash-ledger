import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountType, RoleName } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccountsController } from './accounts.controller.js';
import { AccountImagesService, bankImageType } from './account-images.service.js';

function imageFixture(type: AccountType = AccountType.BANK) {
  const prisma: any = {
    financialAccount: { findUnique: vi.fn(async () => ({ id: 'abc', accountType: type })) },
    auditLog: { create: vi.fn(async () => ({ id: 'audit' })) },
  };
  return { service: new AccountImagesService(prisma), prisma };
}
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,1,2,3,4]);
const sampleId = () => randomUUID();

describe('Owner bank account profile images', () => {
  it('accepts valid PNG content and rejects arbitrary bytes disguised as images', () => {
    expect(bankImageType(png)).toBe('image/png');
    expect(bankImageType(Buffer.from('<svg onload="alert(1)">'))).toBeNull();
    expect(bankImageType(Buffer.from('not really a PNG image'))).toBeNull();
  });
  it('restricts upload and removal endpoints to Owner only', () => {
    expect(Reflect.getMetadata('roles', AccountsController.prototype.uploadImage)).toEqual([RoleName.OWNER]);
    expect(Reflect.getMetadata('roles', AccountsController.prototype.removeImage)).toEqual([RoleName.OWNER]);
    expect(Reflect.getMetadata('roles', AccountsController.prototype.image)).toBeUndefined();
  });
  it('blocks non-bank account types', async () => {
    const { service, prisma } = imageFixture(AccountType.CASH);
    await expect(service.upload(sampleId(),png,'owner')).rejects.toThrow(NotFoundException);
    await expect(service.remove(sampleId(),'owner')).rejects.toThrow(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it('rejects oversized, empty and invalid files before writing', async () => {
    const {service,prisma}=imageFixture();
    for (const input of [undefined,Buffer.alloc(2 * 1024 * 1024 + 1),Buffer.from('this is definitely not an image')]) {
      await expect(service.upload(sampleId(),input,'owner')).rejects.toThrow(BadRequestException);
    }
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it('creates auditable image replacements and restores original logo on removal', async () => {
    const id=sampleId();
    const {service,prisma}=imageFixture();
    try {
      await expect(service.get(id)).rejects.toThrow(NotFoundException);
      await service.upload(id,png,'owner');
      expect((await service.get(id)).contents.equals(png)).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({
        action:'SET_BANK_IMAGE',userId:'owner',entityId:id,
        newValues:expect.objectContaining({contentType:'image/png',customImage:true}),
      })});
      expect((await service.remove(id,'owner')).removed).toBe(true);
      await expect(service.get(id)).rejects.toThrow(NotFoundException);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({
        action:'REMOVE_BANK_IMAGE',entityId:id,
      })});
    } finally { await service.remove(id,'owner').catch(()=>{}); }
  });
});
