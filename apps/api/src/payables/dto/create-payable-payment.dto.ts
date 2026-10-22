import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayablePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  sourceAccountId!: string;

  @IsIn(['CASH', 'CUSTOMER_CARD', 'OTHER_CARD', 'CUSTOMER_BANK', 'CUSTOMER_UPI', 'BENEFICIARY_ACCOUNT', 'OTHER'])
  destinationType!: 'CASH' | 'CUSTOMER_CARD' | 'OTHER_CARD' | 'CUSTOMER_BANK' | 'CUSTOMER_UPI' | 'BENEFICIARY_ACCOUNT' | 'OTHER';

  @IsOptional()
  @IsString()
  destinationId?: string;

  @IsOptional()
  @IsString()
  destinationDetails?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  chargeAmount?: number;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
