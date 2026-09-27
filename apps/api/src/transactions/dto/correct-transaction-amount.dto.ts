import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CorrectTransactionAmountDto {
  @IsNumber()
  @Min(0.01)
  correctedAmount!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
