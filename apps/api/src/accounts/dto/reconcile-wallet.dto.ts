import { IsBoolean, IsNumber, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ReconcileWalletDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99)
  expectedBalance!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99)
  providerBalance!: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99)
  confirmedCharges!: number;

  @IsString() @MinLength(4) @MaxLength(200)
  statementReference!: string;

  @IsString() @MinLength(10) @MaxLength(500)
  reason!: string;

  @IsBoolean()
  confirmed!: boolean;
}
