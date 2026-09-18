import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProviderSettlementReceiptDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  destinationAccountId!: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
