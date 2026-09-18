import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

class DenominationDto {
  @IsNumber() @Min(0.01) denomination!: number;
  @IsInt() @Min(0) quantity!: number;
}

export class OpenCashSessionDto {
  @IsString() cashAccountId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DenominationDto)
  denominations!: DenominationDto[];
}
