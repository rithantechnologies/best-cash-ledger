import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerAepsAccountDto {
  @IsString() @MinLength(1) @MaxLength(150)
  bankName!: string;

  @IsString() @MinLength(1) @MaxLength(150)
  holderName!: string;

  // Reject the full 12-digit Aadhaar number, even if a client bypasses the UI.
  @IsString() @Matches(/^\d{6}$/, { message: 'Enter exactly six digits, not a full Aadhaar number.' })
  aadhaarLastSix!: string;
}

export class UpdateCustomerAepsAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(150)
  bankName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(150)
  holderName?: string;

  @IsOptional() @IsString() @Matches(/^\d{6}$/, { message: 'Enter exactly six digits, not a full Aadhaar number.' })
  aadhaarLastSix?: string;
}
