import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayablePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  sourceAccountId!: string;

  @IsIn(['CASH', 'CUSTOMER_BANK', 'CUSTOMER_UPI'])
  destinationType!: 'CASH' | 'CUSTOMER_BANK' | 'CUSTOMER_UPI';

  @IsOptional()
  @IsString()
  destinationId?: string;

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
