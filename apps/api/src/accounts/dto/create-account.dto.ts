import { AccountNature, AccountType, UsageType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAccountDto {
  @IsString() accountName!: string;
  @IsEnum(AccountType) accountType!: AccountType;
  @IsEnum(AccountNature) accountNature!: AccountNature;
  @IsEnum(UsageType) usageType!: UsageType;

  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() accountReference?: string;
  @IsOptional() @IsString() lastFourDigits?: string;
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @IsOptional() @IsNumber() @Min(0) openingBalance?: number;
}
