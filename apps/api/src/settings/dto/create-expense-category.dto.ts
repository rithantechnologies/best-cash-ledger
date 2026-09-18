import { UsageType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString() name!: string;
  @IsEnum(UsageType) expenseUsage!: UsageType;
}
