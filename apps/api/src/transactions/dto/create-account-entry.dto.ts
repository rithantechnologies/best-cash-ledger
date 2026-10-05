import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAccountEntryDto {
  @IsString() accountId!: string;
  @IsIn(['IN', 'OUT']) direction!: 'IN' | 'OUT';
  @IsIn([
    'LOAN_RECEIVED',
    'LOAN_REPAYMENT',
    'OWNER_FUNDING',
    'OWNER_WITHDRAWAL',
    'OTHER_NON_INCOME',
    'OTHER_NON_EXPENSE',
  ])
  entryKind!:
    | 'LOAN_RECEIVED'
    | 'LOAN_REPAYMENT'
    | 'OWNER_FUNDING'
    | 'OWNER_WITHDRAWAL'
    | 'OTHER_NON_INCOME'
    | 'OTHER_NON_EXPENSE';
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() transactionAt?: string;
  @IsOptional() @IsString() entryLabel?: string;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsString() notes?: string;
}
