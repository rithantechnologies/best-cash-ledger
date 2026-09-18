import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateAepsDto {
  @IsString() customerId!: string;
  @IsString() @Length(4, 4) aadhaarLastFour!: string;
  @IsString() customerBankName!: string;
  @IsNumber() @Min(0.01) withdrawalAmount!: number;
  @IsOptional() @IsString() platformId?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() gatewayId?: string;
  @IsNumber() @Min(0) platformChargeRate!: number;
  @IsNumber() @Min(0) commissionRate!: number;
  @IsString() cashAccountId!: string;
  @IsString() settlementAccountId!: string;
  @IsOptional() @IsBoolean() settledNow?: boolean;
  @IsOptional() @IsDateString() settlementDueAt?: string;
  @IsOptional() @IsString() providerReference?: string;
  @IsOptional() @IsString() notes?: string;
}
