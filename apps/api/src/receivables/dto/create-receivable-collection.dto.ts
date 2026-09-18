import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateReceivableCollectionDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  destinationAccountId!: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
