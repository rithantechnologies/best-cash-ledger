import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateServiceCatalogDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultAmount?: number | null;

  @IsOptional()
  @IsBoolean()
  allowPartnerFulfillment?: boolean;

  @IsOptional()
  @IsString()
  defaultPartnerName?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPartnerCharge?: number | null;
}
