import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
export class UpdateCardDto {
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() cardType?: string;
  @IsOptional() @IsString() @Length(4,4) lastFourDigits?: string;
  @IsOptional() @IsString() nickname?: string;
}
