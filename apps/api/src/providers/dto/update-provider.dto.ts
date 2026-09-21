import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProviderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() providerType?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() supportsAeps?: boolean;
  @IsOptional() @IsNumber() @Min(0) aepsCommissionRate?: number;
}
