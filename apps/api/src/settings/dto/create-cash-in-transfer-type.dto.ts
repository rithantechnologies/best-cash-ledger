import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCashInTransferTypeDto {
  @IsString()
  name!: string;

  @IsIn(['UPI', 'BANK'])
  transferMode!: 'UPI' | 'BANK';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCommissionRate?: number;
}
