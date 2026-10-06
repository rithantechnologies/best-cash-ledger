import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CustomerLedgerAllocationDto {
  @IsIn(['PAYABLE', 'CARD_DUE'])
  targetType!: 'PAYABLE' | 'CARD_DUE';

  @IsString()
  targetId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreateCustomerLedgerEntryDto {
  @IsIn(['PAY_IN', 'PAY_OUT'])
  direction!: 'PAY_IN' | 'PAY_OUT';

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  financialAccountId!: string;

  @IsOptional()
  @IsString()
  customerCardId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CustomerLedgerAllocationDto)
  allocations?: CustomerLedgerAllocationDto[];

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsDateString()
  transactionAt?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
