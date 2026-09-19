import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateQuickCustomerCardDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile must be a valid 10-digit Indian number',
  })
  mobile!: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  lastFourDigits!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;
}
