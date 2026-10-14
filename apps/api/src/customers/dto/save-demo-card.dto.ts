import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Only published synthetic gateway test values are accepted server-side. */
export class SaveDemoCardDto {
  @IsString()
  @Matches(/^\d{16}$/)
  demoNumber!: string;

  // Optional metadata when upgrading an existing last-four-only card in one action.
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(100) nickname?: string;
}
