import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateMicroAtmDto {
  @IsString() customerId!: string;
  @IsString() @Length(4, 4) cardLastFour!: string;
  @IsOptional() @IsString() customerBankName?: string;
  @IsNumber() @Min(0.01) withdrawalAmount!: number;
  @IsString() providerId!: string;
  @IsOptional() @IsString() gatewayId?: string;
  @IsNumber() @Min(0) providerCommissionRate!: number;
  @IsString() cashAccountId!: string;
  @IsString() settlementAccountId!: string;
  @IsOptional() @IsBoolean() settledNow?: boolean;
  @IsOptional() @IsDateString() settlementDueAt?: string;
  @IsOptional() @IsString() providerReference?: string;
  @IsOptional() @IsString() notes?: string;
}
