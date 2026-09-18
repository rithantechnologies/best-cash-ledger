import { CalculationType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateGatewayDto {
  @IsString() gatewayName!: string;
  @IsOptional() @IsString() gatewayCode?: string;
  @IsEnum(CalculationType) defaultChargeType!: CalculationType;
  @IsNumber() defaultChargeRate!: number;
}
