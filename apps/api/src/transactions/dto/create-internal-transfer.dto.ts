import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInternalTransferDto {
  @IsString() sourceAccountId!: string;
  @IsString() destinationAccountId!: string;
  @IsNumber() @Min(0.01) transferAmount!: number;
  @IsOptional() @IsNumber() @Min(0) chargeAmount?: number;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
