import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CustomerType } from '@prisma/client';
import { SettingsService } from './settings.service.js';
import { CustomersService } from '../customers/customers.service.js';

const regular = {id:'regular',name:'Regular',legacyType:CustomerType.REGULAR,isActive:true};
const business = {id:'business',name:'Business',legacyType:null,isActive:true};
const retired = {id:'retired',name:'Former agent',legacyType:null,isActive:false};

function testDb(){
 const types:any={
  findUnique:vi.fn(async ({where}:any)=>where.id==='business'?business:where.id==='retired'?retired:where.legacyType===CustomerType.REGULAR?regular:null),
  findFirst:vi.fn(async()=>null),
  count:vi.fn(async()=>2),
  findMany:vi.fn(async()=>[regular,business]),
  create:vi.fn(async ({data}:any)=>({...data,id:'new-id',isActive:true})),
  update:vi.fn(async ({data,where}:any)=>({...business,...data,id:where.id})),
 };
 const audit:any={create:vi.fn(async()=>({}))};
 const customer:any={
  findFirst:vi.fn(async()=>null),
  findUnique:vi.fn(async()=>({id:'existing',customerTypeId:'business',customerType:CustomerType.REGULAR,fullName:'Existing'})),
  create:vi.fn(async ({data}:any)=>({...data,id:'saved-id'})),
  update:vi.fn(async ({data}:any)=>({...data,id:'existing'})),
 };
 const tx:any={customerTypeConfig:types,auditLog:audit,customer};
 const prisma:any={...tx,$transaction:async(callback:any)=>callback(tx)};
 return {types,audit,customer,prisma};
}
describe('customer type settings',()=>{
 it('lists only active types by default',async()=>{
  const {prisma,types}=testDb();
  const service=new SettingsService(prisma);
  expect(await service.customerTypes()).toHaveLength(2);
  expect(types.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{isActive:true}}));
 });
 it('audits new types and blocks duplicate names',async()=>{
  const {prisma,types,audit}=testDb();
  const service=new SettingsService(prisma);
  await service.createCustomerType({name:'  Business Partner  '},'owner');
  expect(types.create).toHaveBeenCalledWith({data:{name:'Business Partner',sortOrder:10}});
  expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({entityType:'CUSTOMER_TYPE',action:'CREATE'})}));
  types.findFirst.mockResolvedValueOnce(regular);
  await expect(service.createCustomerType({name:'regular'},'owner')).rejects.toThrow(BadRequestException);
 });
 it('prevents retiring the only active type',async()=>{
  const {prisma,types}=testDb();types.count.mockResolvedValueOnce(1);
  const service=new SettingsService(prisma);
  await expect(service.setCustomerTypeActive('business',false,'owner')).rejects.toThrow(BadRequestException);
  expect(types.update).not.toHaveBeenCalled();
 });
});
describe('customer assignment',()=>{
 it('uses custom type ID but keeps legacy enum for compatibility',async()=>{
  const {prisma,customer}=testDb();
  const service=new CustomersService(prisma,{} as any,{} as any,{} as any,{} as any);
  await service.create({fullName:'Asha',customerTypeId:'business'},'owner');
  expect(customer.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
    customerTypeId:'business',customerType:CustomerType.REGULAR,fullName:'ASHA',
  })}));
 });
 it('rejects retired types on new customers',async()=>{
  const {prisma,customer}=testDb();
  const service=new CustomersService(prisma,{} as any,{} as any,{} as any,{} as any);
  await expect(service.create({fullName:'Asha',customerTypeId:'retired'},'owner')).rejects.toThrow(BadRequestException);
  expect(customer.create).not.toHaveBeenCalled();
 });
 it('lets an existing customer retain their retired type, but not assign it to someone else',async()=>{
  const {prisma,customer}=testDb();
  customer.findUnique.mockResolvedValueOnce({id:'existing',customerTypeId:'retired',customerType:CustomerType.REGULAR,fullName:'Existing'});
  const service=new CustomersService(prisma,{} as any,{} as any,{} as any,{} as any);
  await service.update('existing',{customerTypeId:'retired'},'owner');
  expect(customer.update).toHaveBeenCalled();
  customer.findUnique.mockResolvedValueOnce({id:'another',customerTypeId:'business',customerType:CustomerType.REGULAR,fullName:'Another'});
  await expect(service.update('another',{customerTypeId:'retired'},'owner')).rejects.toThrow(BadRequestException);
 });
});
