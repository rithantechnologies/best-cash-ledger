import { UsageType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
export class UpdateExpenseCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(UsageType) expenseUsage?: UsageType;
}
