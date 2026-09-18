import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayablePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  sourceAccountId!: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
