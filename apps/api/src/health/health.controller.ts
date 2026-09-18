import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        success: true,
        service: 'cash-ledger-api',
        database: 'connected',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        success: false,
        service: 'cash-ledger-api',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
