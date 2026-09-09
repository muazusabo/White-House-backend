import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'white-house-eatry-api', timestamp: new Date().toISOString() };
  }
}
