import { CommissionMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CashTransferReceiptAllocationDto {
  @IsString() accountId!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

export class CreateCashTransferDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() beneficiaryId?: string;
  @IsOptional() @IsString() beneficiaryAccountId?: string;
  @IsOptional() @IsString() customerBankAccountId?: string;
  @IsOptional() @IsString() customerUpiAccountId?: string;
  @IsNumber() @Min(0.01) requestedAmount!: number;
  @IsEnum(CommissionMethod) commissionMethod!: CommissionMethod;
  @IsNumber() @Min(0) commissionRate!: number;
  @IsOptional() @IsNumber() @Min(0) commissionAmount?: number;
  @IsOptional() @IsNumber() @Min(0) transferChargeAmount?: number;
  @IsOptional() @IsString() transferChargeType?: string;
  @IsOptional() @IsString() cashAccountId?: string;
  @IsOptional() @IsString() receiptAccountId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CashTransferReceiptAllocationDto)
  receiptAllocations?: CashTransferReceiptAllocationDto[];
  @IsString() sourceAccountId!: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
