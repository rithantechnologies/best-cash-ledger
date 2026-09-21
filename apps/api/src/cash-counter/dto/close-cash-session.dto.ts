import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class DenominationDto {
  @IsNumber() @Min(0.01) denomination!: number;
  @IsInt() @Min(0) quantity!: number;
}

export class CloseCashSessionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => DenominationDto)
  denominations!: DenominationDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() handoverToUserId?: string;
  @IsOptional() @IsString() handoverToCashAccountId?: string;
}
