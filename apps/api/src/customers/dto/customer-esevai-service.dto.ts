import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerEsevaiServiceDto {
  @IsString() @MinLength(1) @MaxLength(150)
  esevaiName!: string;

  @IsString() @MinLength(1) @MaxLength(150)
  serviceName!: string;
}

export class UpdateCustomerEsevaiServiceDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150)
  esevaiName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(150)
  serviceName?: string;
}
