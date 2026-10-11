import { UsageType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateExpenseDto {
  @IsOptional() @IsEnum(UsageType) expenseType?: UsageType;
  @IsString() expenseCategoryId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() transactionAt?: string;
  @IsOptional() @IsString() paymentAccountId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() payee?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CompleteExpenseDto {
  @IsString() paymentAccountId!: string;
  @IsOptional() @IsString() notes?: string;
}

// Full replacement of user-editable expense fields. Null paymentAccountId makes
// an expense pending; edits to posted expenses use auditable adjusting journals.
export class UpdateExpenseDto {
  @IsString() expenseCategoryId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() transactionAt!: string;
  @IsOptional() @IsString() paymentAccountId?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() payee?: string | null;
  @IsOptional() @IsString() referenceNumber?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsString() @MinLength(3) reason!: string;
}
