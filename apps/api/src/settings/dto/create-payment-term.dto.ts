import { CalculationType } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsString, Min } from 'class-validator';

export class CreatePaymentTermDto {
  @IsString() name!: string;
  @IsInt() @Min(0) durationValue!: number;
  @IsString() durationUnit!: string;
  @IsEnum(CalculationType) defaultCommissionType!: CalculationType;
  @IsNumber() @Min(0) defaultCommissionRate!: number;
}
