import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateServiceProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) nickname?: string;
}
