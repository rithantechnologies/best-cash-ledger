import { Type } from 'class-transformer';
import { CommissionMethod } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class AepsNewCustomerDto {
  @IsString() @MaxLength(150) fullName!: string;
  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile must be a valid 10-digit Indian number',
  })
  mobile?: string;
}

export class CreateAepsDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => AepsNewCustomerDto)
  newCustomer?: AepsNewCustomerDto;

  @IsString() @Length(4, 4) aadhaarLastFour!: string;
  @IsString() customerBankName!: string;
  @IsNumber() @Min(0.01) withdrawalAmount!: number;
  @IsOptional() @IsString() platformId?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() gatewayId?: string;
  @IsNumber() @Min(0) platformChargeRate!: number;
  @IsNumber() @Min(0) commissionRate!: number;
  @IsOptional() @IsEnum(CommissionMethod) commissionMethod?: CommissionMethod;
  @IsOptional() @IsBoolean() successful?: boolean;
  @IsOptional() @IsBoolean() cashPayoutNow?: boolean;
  @IsOptional() @IsDateString() cashPayoutDueAt?: string;
  @IsOptional() @IsString() cashAccountId?: string;
  @IsString() settlementAccountId!: string;
  @IsOptional() @IsString() commissionReceiptAccountId?: string;
  @IsOptional() @IsBoolean() settledNow?: boolean;
  @IsOptional() @IsDateString() settlementDueAt?: string;
  @IsOptional() @IsString() providerReference?: string;
  @IsOptional() @IsString() notes?: string;
}
