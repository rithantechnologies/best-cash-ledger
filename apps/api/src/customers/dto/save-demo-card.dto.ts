import { IsString, Matches } from 'class-validator';

/** Only published synthetic gateway test values are accepted server-side. */
export class SaveDemoCardDto {
  @IsString()
  @Matches(/^\d{16}$/)
  demoNumber!: string;
}
