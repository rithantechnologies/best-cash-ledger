import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MaxLength(100)
  bankName!: string;

  @IsOptional()
  @IsString()
  cardType?: string;

  @IsString()
  @Length(4, 4)
  lastFourDigits!: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
