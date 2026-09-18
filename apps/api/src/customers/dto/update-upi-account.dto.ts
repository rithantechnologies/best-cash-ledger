import { IsOptional, IsString } from 'class-validator';
export class UpdateUpiAccountDto {
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() upiId?: string;
  @IsOptional() @IsString() mobileNumber?: string;
  @IsOptional() @IsString() providerName?: string;
}
