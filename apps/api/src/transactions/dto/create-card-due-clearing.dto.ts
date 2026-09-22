import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CardDueRecoveryDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  providerId!: string;

  @IsString()
  gatewayId!: string;

  @IsString()
  destinationAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CardDueCommissionCollectionDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  destinationAccountId!: string;

  @IsString()
  @IsIn(['CASH', 'UPI'])
  paymentMode!: 'CASH' | 'UPI';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
export class CreateCardDueClearingDto {
  @IsString()
  customerId!: string;

  @IsString()
  customerCardId!: string;

  @IsString()
  sourceAccountId!: string;

  @IsNumber()
  @Min(0.01)
  dueAmount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardDueRecoveryDto)
  initialRecovery?: CardDueRecoveryDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardDueCommissionCollectionDto)
  initialCommissionCollection?: CardDueCommissionCollectionDto;
}

export class SetCardDueFollowUpDto {
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;
}
