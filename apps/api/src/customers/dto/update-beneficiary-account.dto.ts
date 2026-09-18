import { IsOptional, IsString } from 'class-validator';
export class UpdateBeneficiaryAccountDto {
  @IsOptional() @IsString() accountType?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() accountReference?: string;
  @IsOptional() @IsString() ifsc?: string;
  @IsOptional() @IsString() upiId?: string;
  @IsOptional() @IsString() mobileNumber?: string;
}
