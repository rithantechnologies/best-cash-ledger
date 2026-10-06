import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
