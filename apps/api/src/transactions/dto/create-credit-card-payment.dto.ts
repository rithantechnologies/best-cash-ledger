import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCreditCardPaymentDto {
  @IsString() creditCardAccountId!: string;
  @IsString() sourceAccountId!: string;
  @IsNumber() @Min(0.01) paymentAmount!: number;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
