import { IsOptional, IsString } from 'class-validator';
export class UpdateBankAccountDto {
  @IsOptional() @IsString() accountHolderName?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() accountReference?: string;
  @IsOptional() @IsString() ifsc?: string;
}
