import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateCustomerLedgerEntryDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() customerCardId?: string | null;
  @IsIn(['PAY_IN', 'PAY_OUT']) direction!: 'PAY_IN' | 'PAY_OUT';
  @IsNumber() @Min(0.01) amount!: number;
  @IsNumber() @Min(0) receivableAmount!: number;
  @IsNumber() @Min(0) payableAmount!: number;
  @IsString() financialAccountId!: string;
  @IsOptional() @IsBoolean() physicalCashConfirmed?: boolean;
  @IsDateString() transactionAt!: string;
  @IsString() @MaxLength(250) remarks!: string;
  @IsOptional() @IsString() @MaxLength(150) referenceNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsString() @MaxLength(160) payoutDestinationDetails?: string | null;
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
