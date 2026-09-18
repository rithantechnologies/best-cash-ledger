import { CalculationType, TransactionType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCommissionRuleDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() gatewayId?: string;
  @IsOptional() @IsString() paymentTermId?: string;
  @IsEnum(TransactionType) transactionType!: TransactionType;
  @IsEnum(CalculationType) commissionType!: CalculationType;
  @IsNumber() @Min(0) commissionRate!: number;
}
