import { IsOptional, IsString } from 'class-validator';
export class CreateUpiAccountDto {
  @IsString() accountName!: string;
  @IsOptional() @IsString() upiId?: string;
  @IsOptional() @IsString() mobileNumber?: string;
  @IsOptional() @IsString() providerName?: string;
}
