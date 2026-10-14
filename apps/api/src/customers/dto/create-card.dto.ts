import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MaxLength(100)
  bankName!: string;

  @IsOptional()
  @IsString()
  cardType?: string;

  @IsOptional()
  @IsString()
  cardNetworkId?: string;

  @IsString()
  @Length(4, 4)
  lastFourDigits!: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional() @IsString() @Matches(/^\d{16}$/) demoCardNumber?: string;
}
