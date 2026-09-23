import { IsDateString, IsString, MinLength } from 'class-validator';

export class UpdateTransactionDateTimeDto {
  @IsDateString()
  transactionAt!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
