import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

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

  // Required only when the selected account is a physical cash drawer.
  @IsOptional()
  @IsBoolean()
  physicalCashConfirmed?: boolean;

  @IsOptional()
  @IsString()
  sourcePayInTransactionId?: string;

  @IsOptional()
  @IsIn(['CASH', 'CARD', 'OTHER_CARD', 'BANK', 'UPI', 'BENEFICIARY_ACCOUNT', 'OTHER'])
  payoutDestinationType?: 'CASH' | 'CARD' | 'OTHER_CARD' | 'BANK' | 'UPI' | 'BENEFICIARY_ACCOUNT' | 'OTHER';

  @IsOptional()
  @IsString()
  payoutDestinationId?: string;

  @IsOptional()
  @IsString()
  payoutDestinationDetails?: string;

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
