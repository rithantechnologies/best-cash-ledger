import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuickCashTransferDto {
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @IsString()
  cashAccountId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionAmount?: number;

  @IsOptional()
  @IsIn(['TRANSFER', 'SERVICE'])
  purpose?: 'TRANSFER' | 'SERVICE';

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsDateString()
  transactionAt?: string;

  @IsOptional()
  @IsIn(['CASH', 'UPI'])
  commissionMode?: 'CASH' | 'UPI';

  @IsOptional()
  @IsIn(['UPI', 'BANK'])
  beneficiaryMode?: 'UPI' | 'BANK';

  @IsOptional()
  @IsString()
  beneficiaryDetails?: string;

  @IsOptional()
  @IsIn(['CASH', 'UPI'])
  servicePaymentMode?: 'CASH' | 'UPI';

  @IsOptional()
  @IsString()
  servicePaymentAccountId?: string;
}

export class CompleteQuickCashTransferDto {
  @IsString()
  sourceAccountId!: string;

  @IsOptional()
  @IsString()
  commissionAccountId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['UPI', 'BANK'])
  beneficiaryMode?: 'UPI' | 'BANK';

  @IsOptional()
  @IsString()
  beneficiaryDetails?: string;
}
