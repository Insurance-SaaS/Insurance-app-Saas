import { Injectable } from '@nestjs/common';
import { Log } from './entities/log.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';

@Injectable()
export class LogService {
  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
  ) {}

  private get logRepository() {
    return this.tenantRepositoryFactory.getRepository(Log);
  }

  private get userRepository() {
    return this.tenantRepositoryFactory.getRepository(User);
  }

  // For signup (before user exists in DB)
  async createSignupLog(
    action: string,
    email: string,
    actionDuration: string,
    timestamp?: Date,
  ): Promise<Log> {
    const log = this.logRepository.create({
      action,
      actionDuration,
      timestamp: timestamp ?? new Date(),
      email, // ✅ no relation yet
    });

    return this.logRepository.save(log);
  }

  // For authenticated actions (after user exists in DB)
  async createLog(
    action: string,
    userId: string,
    actionDuration: string,
    timestamp?: Date,
  ): Promise<Log> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });

    const log = this.logRepository.create({
      action,
      actionDuration,
      timestamp: timestamp ?? new Date(),
      user, // ✅ relation set
      email: user.email, // ✅ also store raw email
    });

    return this.logRepository.save(log);
  }

  async getLogs(): Promise<Log[]> {
    return this.logRepository.find({
      relations: ['user'],
    });
  }

  async getLogsByUser(userId: string): Promise<Log[]> {
    return this.logRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }
}
