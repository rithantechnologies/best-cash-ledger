import { IsIn, IsString } from 'class-validator';

export class CreateCashInTransferTypeDto {
  @IsString()
  name!: string;

  @IsIn(['UPI', 'BANK'])
  transferMode!: 'UPI' | 'BANK';
}
