import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCashInTransferTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['UPI', 'BANK'])
  transferMode?: 'UPI' | 'BANK';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCommissionRate?: number;
}
