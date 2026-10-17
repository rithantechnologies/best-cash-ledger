import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { AccountImagesService } from './account-images.service.js';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, AccountImagesService]
})
export class AccountsModule {}
