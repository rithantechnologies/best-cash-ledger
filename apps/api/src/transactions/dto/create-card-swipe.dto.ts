import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

class CardSwipeCustomerPaymentDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() sourceAccountId!: string;
}

class CardSwipeNewCustomerDto {
  @IsString() @MaxLength(150) fullName!: string;
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile must be a valid 10-digit Indian number',
  })
  mobile!: string;
  @IsString() @MaxLength(100) bankName!: string;
  @IsString() @Length(4, 4) @Matches(/^\d{4}$/) lastFourDigits!: string;
}

export class CreateCardSwipeDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() customerCardId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardSwipeNewCustomerDto)
  newCustomer?: CardSwipeNewCustomerDto;

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
