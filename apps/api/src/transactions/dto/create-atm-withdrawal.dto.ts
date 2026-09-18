import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAtmWithdrawalDto {
  @IsString() bankAccountId!: string;
  @IsString() cashAccountId!: string;
  @IsNumber() @Min(0.01) cashReceived!: number;
  @IsOptional() @IsNumber() @Min(0) atmCharge?: number;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
