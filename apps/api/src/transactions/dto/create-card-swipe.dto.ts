import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class CardSwipeCustomerPaymentDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() sourceAccountId!: string;
}

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
  @IsOptional() @IsString() settlementAccountId?: string;
  @IsOptional() @IsBoolean() settledNow?: boolean;
  @IsOptional() @IsDateString() settlementDueAt?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CardSwipeCustomerPaymentDto)
  customerPayments?: CardSwipeCustomerPaymentDto[];
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
