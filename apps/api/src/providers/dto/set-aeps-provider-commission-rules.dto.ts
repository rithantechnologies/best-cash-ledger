import { Type } from 'class-transformer';
import { CalculationType } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

export class AepsProviderCommissionRuleDto {
  @IsNumber() @Min(0) minAmount!: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @IsEnum(CalculationType) calculationType!: CalculationType;
  @IsNumber() @Min(0) value!: number;
}

export class SetAepsProviderCommissionRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AepsProviderCommissionRuleDto)
  rules!: AepsProviderCommissionRuleDto[];
}
