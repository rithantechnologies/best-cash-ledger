import { IsString, MinLength } from 'class-validator';

export class ReverseTransactionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
