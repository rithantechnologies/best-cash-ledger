import { IsOptional, IsString } from 'class-validator';

export class CreateProviderDto {
  @IsString() name!: string;
  @IsString() providerType!: string;
  @IsOptional() @IsString() notes?: string;
}
