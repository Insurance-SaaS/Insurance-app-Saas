import {
  ConflictException,
  NotFoundException,
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity';
import { MinioService } from 'src/cache_storage/services/minio.service';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { CustomFieldsService } from 'src/core/custom-fields/custom-fields.service';
import { CustomFieldEntityType } from 'src/core/custom-fields/entities/custom-field-definition.entity';
import { UploadedFile } from 'src/shared/types/uploaded-file';
import { IUsersService } from 'src/contracts/interfaces/i-users.service';
import * as crypto from 'node:crypto';
import { MINIO_BUCKETS } from 'src/shared/constants/minio-buckets';
import { buildTenantCacheKey } from 'src/shared/utils/cache-key.util';
import { normalizeEmail } from 'src/shared/decorators/normalized-email.decorator';

@Injectable()
export class UsersService implements IUsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly cacheNamespace = 'users';

  private getTenantSlug(): string {
    return this.tenantContext.requireTenant().slug;
  }

  private buildCacheKeyById(id: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), this.cacheNamespace, 'id', id);
  }

  private buildCacheKeyByEmail(email: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), this.cacheNamespace, 'email', email);
  }

  private buildCacheKeyByPhone(phone: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), this.cacheNamespace, 'phone', phone);
  }

  private buildCacheKeyAll(): string {
    return buildTenantCacheKey(this.getTenantSlug(), this.cacheNamespace, 'all');
  }

  private buildTenantObjectName(objectName: string): string {
    return `${this.getTenantSlug()}/profile-pictures/${objectName}`;
  }

  private async tryGetCachedById(id: string): Promise<User | null> {
    try {
      const cached = await this.redisService.get(this.buildCacheKeyById(id));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Failed to read user from cache by id ${id}: ${String(error)}`);
    }
    return null;
  }

  private async tryGetCachedByEmail(email: string): Promise<User | null> {
    try {
      const cached = await this.redisService.get(this.buildCacheKeyByEmail(email));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Failed to read user from cache by email ${email}: ${String(error)}`);
    }
    return null;
  }

  private async tryGetCachedByPhone(phone: string): Promise<User | null> {
    try {
      const cached = await this.redisService.get(this.buildCacheKeyByPhone(phone));
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Failed to read user from cache by phone ${phone}: ${String(error)}`);
    }
    return null;
  }

  private async tryGetCachedAll(): Promise<User[] | null> {
    try {
      const cached = await this.redisService.get(this.buildCacheKeyAll());
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Failed to read all users from cache: ${String(error)}`);
    }
    return null;
  }

  private async cacheUser(user: User): Promise<void> {
    try {
      const cacheConfig = this.configService.get('cache');
      const ttl = cacheConfig.ttl.users;
      const payload = JSON.stringify(this.withoutPassword(user));
      await this.redisService.set(this.buildCacheKeyById(user.id), payload, ttl);
      if (user.email) {
        await this.redisService.set(this.buildCacheKeyByEmail(user.email), payload, ttl);
      }
      if (user.phone) {
        await this.redisService.set(this.buildCacheKeyByPhone(user.phone), payload, ttl);
      }
    } catch (error) {
      this.logger.warn(`Failed to cache user ${user.id}: ${String(error)}`);
    }
  }

  private async cacheAllUsers(users: User[]): Promise<void> {
    try {
      const cacheConfig = this.configService.get('cache');
      const ttl = cacheConfig.ttl.users;
      const payload = JSON.stringify(users.map((u) => this.withoutPassword(u)));
      await this.redisService.set(this.buildCacheKeyAll(), payload, ttl);
    } catch (error) {
      this.logger.warn(`Failed to cache all users: ${String(error)}`);
    }
  }

  private async invalidateUserCache(user: User): Promise<void> {
    try {
      await this.redisService.del(this.buildCacheKeyById(user.id));
      if (user.email) {
        await this.redisService.del(this.buildCacheKeyByEmail(user.email));
      }
      if (user.phone) {
        await this.redisService.del(this.buildCacheKeyByPhone(user.phone));
      }
      // Also invalidate the all users cache
      await this.redisService.del(this.buildCacheKeyAll());
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for user ${user.id}: ${String(error)}`);
    }
  }

  constructor(
    private readonly tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly minioservice: MinioService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly appLogger: AppLogger,
    private readonly tenantContext: TenantContextService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  private get usersRepository() {
    return this.tenantRepositoryFactory.getRepository(User);
  }

  /** The hash must never travel with a user object that is cached or returned. */
  private withoutPassword<T extends Partial<User>>(user: T): T {
    if (user && 'password' in user) {
      delete user.password;
    }
    return user;
  }

  /**
   * The only way to read a password hash. Used by login and password change;
   * the result is never cached.
   */
  async findCredentialsByEmail(email: string): Promise<Pick<User, 'id' | 'password'> | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .select(['user.id'])
      .addSelect('user.password')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async findCredentialsById(id: string): Promise<Pick<User, 'id' | 'password'> | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .select(['user.id'])
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
  }

  async createUser(
    user: Partial<User>,
    file?: UploadedFile,
    options?: { passwordIsHashed?: boolean },
  ): Promise<User> {
    user.email = normalizeEmail(user.email);
    if (user.password && !options?.passwordIsHashed) {
      user.password = await argon2.hash(user.password);
    }
    const existingUser = await this.usersRepository.findOne({
      where: [{ email: user.email }, { phone: user.phone }],
    });

    if (existingUser) {
      if (existingUser.email === user.email) {
        throw new ConflictException('Email already in use');
      }
      if (existingUser.phone === user.phone) {
        throw new ConflictException('Phone number already in use');
      }
    }
    if (user.customFields) {
      const tenant = this.tenantContext.getTenant();
      if (!tenant) {
        throw new BadRequestException('Tenant context is required for custom fields');
      }

      const validation = await this.customFieldsService.validateCustomFields(
        tenant.id,
        CustomFieldEntityType.USER,
        user.customFields as Record<string, unknown>,
      );
      if (!validation.valid) {
        throw new BadRequestException(validation.errors);
      }
    }

    const newUser = this.usersRepository.create(user);

    return this.withoutPassword(await this.usersRepository.save(newUser));
  }
  async findByEmail(email: string): Promise<User | null> {
    email = normalizeEmail(email);
    // Try cache first
    const cached = await this.tryGetCachedByEmail(email);
    if (cached) {
      return cached;
    }

    const user = await this.usersRepository.findOne({ where: { email } });
    if (user) {
      await this.cacheUser(user);
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    // Try cache first
    const cached = await this.tryGetCachedById(id);
    if (cached) {
      return cached;
    }

    const user = await this.usersRepository.findOne({ where: { id } });
    if (user) {
      await this.cacheUser(user);
    }
    return user;
  }

  async findAll(): Promise<User[]> {
    // Try cache first
    const cached = await this.tryGetCachedAll();
    if (cached) {
      return cached;
    }

    const users = await this.usersRepository.find();
    await this.cacheAllUsers(users);
    return users;
  }

  async findByPhone(phone: string): Promise<User | null> {
    // Try cache first
    const cached = await this.tryGetCachedByPhone(phone);
    if (cached) {
      return cached;
    }

    const user = await this.usersRepository.findOne({ where: { phone } });
    if (user) {
      await this.cacheUser(user);
    }
    return user;
  }

  async forgotPassword(email: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.password = await argon2.hash(newPassword);
    await this.usersRepository.save(user);
    this.withoutPassword(user);
    await this.invalidateUserCache(user);
    return { message: 'Password reset successfully' };
  }

  async updateUser(
    id: string,
    updates: Partial<User>,
  ): Promise<{ message: string; updatedUser: User }> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.phone === updates.phone) {
      throw new ConflictException('this is already your phone number, choose another one');
    }

    if (updates.phone) {
      const existingUser = await this.usersRepository.findOne({ where: { phone: updates.phone } });
      if (existingUser) {
        throw new ConflictException('Phone number already in use');
      }
      user.phone = updates.phone;
    }
    if (updates.password) {
      updates.password = await argon2.hash(updates.password);
      user.password = updates.password;
    }
    if (updates.username) {
      user.username = updates.username;
    }
    if (updates.preferredLanguage) {
      user.preferredLanguage = updates.preferredLanguage;
    }
    if (updates.role) {
      user.role = updates.role;
    }
    if (updates.customFields) {
      const tenant = this.tenantContext.getTenant();
      if (!tenant) {
        throw new BadRequestException('Tenant context is required for custom fields');
      }

      const validation = await this.customFieldsService.validateCustomFields(
        tenant.id,
        CustomFieldEntityType.USER,
        updates.customFields as Record<string, unknown>,
      );
      if (!validation.valid) {
        throw new BadRequestException(validation.errors);
      }

      user.customFields = updates.customFields as Record<string, unknown>;
    }

    const updatedUser = this.withoutPassword(await this.usersRepository.save(user));
    this.withoutPassword(updates);

    // Invalidate and recache
    await this.invalidateUserCache(user);
    await this.cacheUser(updatedUser);

    return { message: 'Profile updated successfully', updatedUser };
  }

  async updatePhoto(
    id: string,
    file: UploadedFile,
  ): Promise<{ message: string; profilePictureUrl?: string }> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!file) {
      throw new BadRequestException('No picture provided');
    }

    // ✅ Delete old picture if exists and is valid
    if (user.profilePictureUrl && user.profilePictureUrl !== 'undefined') {
      try {
        await this.minioservice.invalidatePresignedCache(user.profilePictureUrl);
        await this.minioservice.deleteFile(user.profilePictureUrl);
        this.appLogger.log('Deleted old profile picture', 'UsersService');
      } catch (error) {
        // Log warning but don't fail the upload process
        this.appLogger.warn(
          `Failed to delete old profile picture: ${(error as Error).message}`,
          'UsersService',
        );
        // Continue with upload despite deletion failure
      }
    }

    // ✅ Generate unique filename to avoid conflicts
    const uniqueId = crypto.randomUUID();
    const fileExtension = file.originalname.split('.').pop() || 'jpg';
    const objectName = this.buildTenantObjectName(
      `profile-${Date.now()}-${uniqueId}.${fileExtension}`,
    );

    try {
      const profilePictureUrl = await this.minioservice.uploadFile(
        MINIO_BUCKETS.PROFILE_PICTURES,
        objectName,
        file.buffer,
        file.mimetype,
      );

      // ✅ Update user in database
      user.profilePictureUrl = profilePictureUrl;
      await this.usersRepository.save(user);

      this.appLogger.log('Profile picture updated successfully', 'UsersService');

      let signedUrl: string | null = null;
      try {
        signedUrl = await this.minioservice.getPresignedGetUrl(profilePictureUrl, 3600);
      } catch (_) {
        // The signed URL is optional in the response; the upload itself succeeded.
      }

      // Cache user with new URL and clear list caches
      await this.invalidateUserCache(user);
      await this.cacheUser(user);

      return {
        message: 'Profile picture updated successfully',
        profilePictureUrl: signedUrl || profilePictureUrl,
      };
    } catch (error) {
      this.appLogger.error(
        'Error uploading profile picture',
        (error as any)?.stack,
        'UsersService',
      );
      throw new BadRequestException('Failed to upload profile picture');
    }
  }
  async deleteUser(id: string): Promise<{ message: string }> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete profile picture from MinIO if it exists
    if (user.profilePictureUrl && user.profilePictureUrl !== 'undefined') {
      try {
        await this.minioservice.invalidatePresignedCache(user.profilePictureUrl);
        await this.minioservice.deleteFile(user.profilePictureUrl);
        this.appLogger.log(`Deleted profile picture for user ${id}`, 'UsersService');
      } catch (error) {
        this.appLogger.warn(
          `Failed to delete profile picture for user ${id}: ${String(error)}`,
          'UsersService',
        );
        // Continue with user deletion even if file deletion fails
      }
    }

    // Delete user from database
    await this.usersRepository.remove(user);

    // Invalidate all cache entries for this user
    await this.invalidateUserCache(user);

    this.appLogger.log(`User ${id} deleted successfully`, 'UsersService');

    return { message: 'User deleted successfully' };
  }
}
