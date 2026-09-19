import { CustomerType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional() @IsEnum(CustomerType) customerType?: CustomerType;
  @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @IsOptional()
  @IsString()
  @Matches(new RegExp('^[6-9][0-9]{9}$'), {
    message: 'Mobile must be a valid 10-digit Indian number',
  })
  mobile?: string;
  @IsOptional() @IsString() notes?: string;
}
