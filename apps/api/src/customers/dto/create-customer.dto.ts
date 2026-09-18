import { CustomerType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobile?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
