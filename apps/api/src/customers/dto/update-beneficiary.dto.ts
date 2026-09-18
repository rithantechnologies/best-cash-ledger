import { IsOptional, IsString } from 'class-validator';
export class UpdateBeneficiaryDto {
  @IsOptional() @IsString() beneficiaryName?: string;
  @IsOptional() @IsString() relationshipNote?: string;
  @IsOptional() @IsString() notes?: string;
}
