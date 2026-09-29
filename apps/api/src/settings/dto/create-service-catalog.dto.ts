import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceCatalogDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultAmount?: number;

  @IsOptional()
  @IsBoolean()
  allowPartnerFulfillment?: boolean;

  @IsOptional()
  @IsString()
  defaultPartnerName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPartnerCharge?: number;
}
