import { IsOptional, IsString, MinLength } from 'class-validator';

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

  @IsString()
  @MinLength(1)
  referenceNumber!: string;
}
