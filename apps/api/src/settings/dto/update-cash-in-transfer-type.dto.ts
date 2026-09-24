import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCashInTransferTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['UPI', 'BANK'])
  transferMode?: 'UPI' | 'BANK';
}
