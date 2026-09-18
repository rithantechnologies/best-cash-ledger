import { IsString, MinLength } from 'class-validator';

export class CancelReceivableDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
