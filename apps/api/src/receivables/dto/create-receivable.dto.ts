import { ReceivableReasonCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateReceivableDto {
  @IsString()
  customerId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  sourceAccountId?: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsEnum(ReceivableReasonCategory)
  reasonCategory?: ReceivableReasonCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
