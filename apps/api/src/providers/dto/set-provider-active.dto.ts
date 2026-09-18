import { IsBoolean } from 'class-validator';
export class SetProviderActiveDto {
  @IsBoolean() isActive!: boolean;
}
