import { CalculationType } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export class UpdatePaymentTermDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) durationValue?: number;
  @IsOptional() @IsString() durationUnit?: string;
  @IsOptional() @IsEnum(CalculationType) defaultCommissionType?: CalculationType;
  @IsOptional() @IsNumber() @Min(0) defaultCommissionRate?: number;
}
