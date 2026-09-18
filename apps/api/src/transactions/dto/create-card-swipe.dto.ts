import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCardSwipeDto {
  @IsString() customerId!: string;
  @IsString() customerCardId!: string;
  @IsNumber() @Min(0.01) swipeAmount!: number;
  @IsString() providerId!: string;
  @IsString() gatewayId!: string;
  @IsNumber() @Min(0) providerChargeRate!: number;
  @IsNumber() @Min(0) commissionRate!: number;
  @IsString() paymentTermId!: string;
  @IsDateString() dueAt!: string;
  @IsString() settlementAccountId!: string;
  @IsOptional() @IsBoolean() settledNow?: boolean;
  @IsOptional() @IsDateString() settlementDueAt?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
