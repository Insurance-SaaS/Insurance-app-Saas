import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { NoTenant } from 'src/core/tenant/decorators/no-tenant.decorator';

@Public()
@NoTenant()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
