import { UsageType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() accountReference?: string;
  @IsOptional() @IsString() lastFourDigits?: string;
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @IsOptional() @IsEnum(UsageType) usageType?: UsageType;
}
