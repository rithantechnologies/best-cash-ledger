import { UsageType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() bankName?: string | null;
  @IsOptional() @IsString() accountReference?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}$/) lastFourDigits?: string | null;
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @IsOptional() @IsEnum(UsageType) usageType?: UsageType;
}
