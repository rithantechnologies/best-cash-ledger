import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordCardSwipeCommissionReceiptDto {
  @IsString()
  receiptAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
