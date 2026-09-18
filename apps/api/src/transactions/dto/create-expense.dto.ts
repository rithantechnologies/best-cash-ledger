import { UsageType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsEnum(UsageType) expenseType!: UsageType;
  @IsString() expenseCategoryId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() paymentAccountId!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
