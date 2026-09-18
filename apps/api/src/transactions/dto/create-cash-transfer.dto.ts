import { CommissionMethod } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCashTransferDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() beneficiaryId?: string;
  @IsOptional() @IsString() beneficiaryAccountId?: string;
  @IsOptional() @IsString() customerBankAccountId?: string;
  @IsOptional() @IsString() customerUpiAccountId?: string;
  @IsNumber() @Min(0.01) requestedAmount!: number;
  @IsEnum(CommissionMethod) commissionMethod!: CommissionMethod;
  @IsNumber() @Min(0) commissionRate!: number;
  @IsOptional() @IsNumber() @Min(0) transferChargeAmount?: number;
  @IsOptional() @IsString() transferChargeType?: string;
  @IsString() cashAccountId!: string;
  @IsString() sourceAccountId!: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
