import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class DenominationDto {
  @IsNumber() @Min(0.01) denomination!: number;
  @IsInt() @Min(0) quantity!: number;
}

export class OpenCashSessionDto {
  @IsString() cashAccountId!: string;
  @IsOptional() @IsString() responsibleUserId?: string;
  @IsOptional() @IsString() sourceCashAccountId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DenominationDto)
  denominations!: DenominationDto[];
}
