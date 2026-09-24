import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceCatalogDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultAmount?: number;
}
