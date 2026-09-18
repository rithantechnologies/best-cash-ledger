import { IsBoolean } from 'class-validator';
export class SetCustomerItemActiveDto {
  @IsBoolean() isActive!: boolean;
}
