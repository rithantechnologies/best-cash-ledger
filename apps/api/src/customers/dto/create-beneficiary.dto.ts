import { IsOptional, IsString } from 'class-validator';
export class CreateBeneficiaryDto {
  @IsString() beneficiaryName!: string;
  @IsOptional() @IsString() relationshipNote?: string;
  @IsOptional() @IsString() notes?: string;
}
