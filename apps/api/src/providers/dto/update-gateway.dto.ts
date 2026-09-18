import { CalculationType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
export class UpdateGatewayDto {
  @IsOptional() @IsString() gatewayName?: string;
  @IsOptional() @IsString() gatewayCode?: string;
  @IsOptional() @IsEnum(CalculationType) defaultChargeType?: CalculationType;
  @IsOptional() @IsNumber() @Min(0) defaultChargeRate?: number;
}
