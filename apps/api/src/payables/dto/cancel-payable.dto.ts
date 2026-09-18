import { IsString, MinLength } from 'class-validator';

export class CancelPayableDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
