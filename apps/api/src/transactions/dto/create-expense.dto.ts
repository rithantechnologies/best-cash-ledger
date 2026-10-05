import { UsageType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsOptional() @IsEnum(UsageType) expenseType?: UsageType;
  @IsString() expenseCategoryId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() transactionAt?: string;
  @IsOptional() @IsString() paymentAccountId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteExpenseDto {
  @IsString() paymentAccountId!: string;
  @IsOptional() @IsString() notes?: string;
}
