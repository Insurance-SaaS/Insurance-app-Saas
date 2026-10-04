import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PlatformAuth } from 'src/auth/decorators/platform-auth.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { PlatformAdminLoginDto } from './dtos/platform-admin-login.dto';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminRefreshDto } from './dtos/platform-admin-refresh.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { NoTenant } from 'src/core/tenant/decorators/no-tenant.decorator';

@ApiTags('platform-admin-auth')
@NoTenant()
@Controller('platform/admin-auth')
export class PlatformAdminAuthController {
  constructor(private readonly platformAdminAuthService: PlatformAdminAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Platform admin login' })
  @ApiOkResponse({ description: 'Platform admin authenticated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid credentials or request' })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async login(@Body() body: PlatformAdminLoginDto) {
    return this.platformAdminAuthService.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Platform admin refresh access token' })
  @ApiOkResponse({ description: 'New platform admin tokens generated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid refresh request' })
  async refresh(@Body() body: PlatformAdminRefreshDto) {
    return this.platformAdminAuthService.refresh(body.refreshToken);
  }

  @PlatformAuth()
  @UseGuards(PlatformAdminGuard)
  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Platform admin logout (revokes the refresh token)' })
  async logout(@Req() req: { user: { id: string } }) {
    return this.platformAdminAuthService.logout(req.user.id);
  }
}
