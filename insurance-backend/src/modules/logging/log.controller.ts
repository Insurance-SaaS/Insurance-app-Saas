import { Controller, Post, Get, Body, Req } from '@nestjs/common';
import { LogService } from './log.service';
import { CreateLogDto } from './dtos/create-log.dto';
import { FastifyRequest } from 'fastify';
import { CreateSignupLogDto } from './dtos/signup-log.dto';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/modules/users/entities/user.entity';

@Controller('logs')
export class LogController {
  constructor(
    private readonly logService: LogService,
    private readonly logger: AppLogger,
  ) {}
  @Post('signup-log')
  async createSignupLog(@Body() createLogDto: CreateSignupLogDto, @Req() req: FastifyRequest) {
    // here, CreateSignupLogDto will contain the email instead of userId
    this.logger.log('signup-log request', 'LogController', { requestId: (req as any)?.requestId });
    return this.logService.createSignupLog(
      createLogDto.action,
      createLogDto.email,
      createLogDto.actionDuration,
      createLogDto.timestamp,
    );
  }
  @Post('create-log')
  async createLog(@Body() createLogDto: CreateLogDto, @Req() req: FastifyRequest) {
    const userId = (req as any).user?.id!; // extract userId from auth guard
    const { action, actionDuration } = createLogDto;
    this.logger.log('create-log request', 'LogController', {
      requestId: (req as any)?.requestId,
      userId,
      action,
    });
    return this.logService.createLog(action, userId, actionDuration);
  }

  @Roles(UserRole.TENANT_ADMIN)
  @Get()
  async getLogs() {
    return this.logService.getLogs();
  }
  @Get('by-user')
  async getLogsByUser(@Req() req: FastifyRequest) {
    const userId = (req as any).user?.id!;
    this.logger.log('getLogsByUser request', 'LogController', {
      requestId: (req as any)?.requestId,
      userId,
    });
    return this.logService.getLogsByUser(userId);
  }
}
