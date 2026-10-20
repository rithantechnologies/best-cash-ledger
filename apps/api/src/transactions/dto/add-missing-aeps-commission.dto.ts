import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, IsUUID } from 'class-validator';

export class AddMissingAepsCommissionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  amount!: number;

  @IsIn(['CASH', 'BANK_UPI'])
  receivedVia!: 'CASH' | 'BANK_UPI';

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
