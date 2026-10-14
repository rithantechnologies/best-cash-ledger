import { CustomerType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsUUID()
  customerTypeId?: string;

  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile must be a valid 10-digit Indian number',
  })
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ebNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
