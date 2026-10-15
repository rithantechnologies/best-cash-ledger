import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTransactionDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  referenceNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;

  @IsString()
  @MinLength(3)
  reason!: string;
}
