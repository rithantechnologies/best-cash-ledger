import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateServiceProfileDto {
  @IsString()
  @MinLength(1)
  serviceName!: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  providerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  ownerName?: string;

  @IsString()
  @MinLength(1)
  referenceNumber!: string;
}
