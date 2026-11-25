import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateFollowUpDto {
  @IsIn(['CARD_RETRY', 'BANK_REFUND']) kind!: 'CARD_RETRY' | 'BANK_REFUND';
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() cardId?: string;
  @IsOptional() @IsUUID() providerId?: string;
  @IsOptional() @IsUUID() gatewayId?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsString() @MaxLength(60) sourceTransactionNumber?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999) expectedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999) plannedSwipeAmount?: number;
  @IsOptional() @IsString() @MaxLength(120) reference?: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsDateString() nextReminderAt?: string;
}

export class UpdateFollowUpDto {
  @IsIn(['NOTE', 'SCHEDULE', 'REMIND_LATER', 'COMPLETE', 'CANCEL', 'REOPEN', 'VERIFY_REFUND', 'SET_AMOUNT', 'RECORD_SWIPE'])
  action!: 'NOTE' | 'SCHEDULE' | 'REMIND_LATER' | 'COMPLETE' | 'CANCEL' | 'REOPEN' | 'VERIFY_REFUND' | 'SET_AMOUNT' | 'RECORD_SWIPE';
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999) plannedSwipeAmount?: number;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsDateString() nextReminderAt?: string;
  @IsOptional() @IsString() @MaxLength(60) receiptTransactionNumber?: string;
  @IsOptional() @IsString() @MaxLength(60) swipeTransactionNumber?: string;
}
