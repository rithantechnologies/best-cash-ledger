import { IsOptional, IsString } from 'class-validator';
export class UpdateProviderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() providerType?: string;
  @IsOptional() @IsString() notes?: string;
}
