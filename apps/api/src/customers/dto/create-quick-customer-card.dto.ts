import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateQuickCustomerCardDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsString()
  @MaxLength(20)
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
