import { IsOptional, IsString } from 'class-validator';
export class CreateBankAccountDto {
  @IsString() accountHolderName!: string;
  @IsString() bankName!: string;
  @IsString() accountReference!: string;
  @IsOptional() @IsString() ifsc?: string;
}
