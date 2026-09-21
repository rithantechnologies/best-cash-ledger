import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProviderDto {
  @IsString() name!: string;
  @IsString() providerType!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() supportsAeps?: boolean;
  @IsOptional() @IsNumber() @Min(0) aepsCommissionRate?: number;
}
