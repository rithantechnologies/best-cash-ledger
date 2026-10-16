import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerAepsAccountDto {
  @IsString() @MinLength(1) @MaxLength(150)
  bankName!: string;

  @IsString() @MinLength(1) @MaxLength(150)
  holderName!: string;

  @IsString() @Matches(/^\d{12}$/, { message: 'Enter exactly 12 digits for PR Number.' })
  prNumber!: string;
}

export class UpdateCustomerAepsAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150)
  bankName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(150)
  holderName?: string;

  @IsOptional() @IsString() @Matches(/^\d{12}$/, { message: 'Enter exactly 12 digits for PR Number.' })
  prNumber?: string;
}
