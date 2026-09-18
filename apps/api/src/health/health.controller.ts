import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      success: true,
      service: 'cash-ledger-api',
      timestamp: new Date().toISOString(),
    };
  }
}
