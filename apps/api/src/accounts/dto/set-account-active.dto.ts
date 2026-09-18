import { IsBoolean } from 'class-validator';

export class SetAccountActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
