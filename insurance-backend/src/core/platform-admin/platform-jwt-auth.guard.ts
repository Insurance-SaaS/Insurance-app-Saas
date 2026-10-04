import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PLATFORM_JWT_STRATEGY } from './platform-jwt.strategy';

@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard(PLATFORM_JWT_STRATEGY) {}
