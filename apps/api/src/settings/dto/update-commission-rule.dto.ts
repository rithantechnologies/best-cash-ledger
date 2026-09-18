import { CalculationType, TransactionType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export class UpdateCommissionRuleDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() providerId?: string;
  @IsOptional() @IsString() gatewayId?: string;
  @IsOptional() @IsString() paymentTermId?: string;
  @IsOptional() @IsEnum(TransactionType) transactionType?: TransactionType;
  @IsOptional() @IsEnum(CalculationType) commissionType?: CalculationType;
  @IsOptional() @IsNumber() @Min(0) commissionRate?: number;
}
