import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { PlatformAdmin } from './entities/platform-admin.entity';
import { PlatformAdminCredential } from './entities/platform-admin-credential.entity';

@Injectable()
export class PlatformAdminService {
  static readonly MIN_PASSWORD_LENGTH = 12;

  constructor(
    @InjectRepository(PlatformAdmin)
    private readonly platformAdminRepository: Repository<PlatformAdmin>,
    @InjectRepository(PlatformAdminCredential)
    private readonly platformAdminCredentialsRepository: Repository<PlatformAdminCredential>,
  ) {}

  async isActivePlatformAdmin(email: string): Promise<boolean> {
    if (!email) {
      return false;
    }

    const admin = await this.platformAdminRepository.findOne({
      where: { email: email.toLowerCase(), isActive: true },
    });
    return Boolean(admin);
  }

  async findActiveByEmail(email: string): Promise<PlatformAdmin | null> {
    if (!email) {
      return null;
    }
    return this.platformAdminRepository.findOne({
      where: { email: email.toLowerCase(), isActive: true },
    });
  }

  async validateCredentials(email: string, password: string): Promise<PlatformAdmin | null> {
    const admin = await this.findActiveByEmail(email);
    if (!admin) {
      return null;
    }

    const credentials = await this.platformAdminCredentialsRepository.findOne({
      where: { platformAdminId: admin.id },
    });
    if (!credentials) {
      return null;
    }

    const valid = await argon2.verify(credentials.passwordHash, password);
    return valid ? admin : null;
  }

  // ─── Administration (the `platform-admin` command) ────────────────────
  // There is deliberately no HTTP endpoint for these: the first administrator
  // cannot be created by an administrator, and a leaked platform token should
  // not be able to mint more of them.

  private assertUsablePassword(password: string): void {
    if (!password || password.length < PlatformAdminService.MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `The password must be at least ${PlatformAdminService.MIN_PASSWORD_LENGTH} characters long`,
      );
    }
  }

  private async findByEmail(email: string): Promise<PlatformAdmin> {
    const admin = await this.platformAdminRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!admin) {
      throw new NotFoundException(`No platform administrator with the email ${email}`);
    }
    return admin;
  }

  async create(email: string, password: string, fullName?: string): Promise<PlatformAdmin> {
    const normalized = email.trim().toLowerCase();
    if (!isEmail(normalized)) {
      throw new BadRequestException(`"${email}" is not an email address`);
    }
    this.assertUsablePassword(password);
    if (await this.platformAdminRepository.findOne({ where: { email: normalized } })) {
      throw new ConflictException(`A platform administrator with the email ${normalized} already exists`);
    }

    const admin = await this.platformAdminRepository.save(
      this.platformAdminRepository.create({ email: normalized, fullName, isActive: true }),
    );
    await this.platformAdminCredentialsRepository.save(
      this.platformAdminCredentialsRepository.create({
        platformAdminId: admin.id,
        passwordHash: await argon2.hash(password),
      }),
    );
    return admin;
  }

  async setPassword(email: string, password: string): Promise<void> {
    this.assertUsablePassword(password);
    const admin = await this.findByEmail(email);
    const passwordHash = await argon2.hash(password);

    const credentials = await this.platformAdminCredentialsRepository.findOne({
      where: { platformAdminId: admin.id },
    });
    await this.platformAdminCredentialsRepository.save(
      credentials
        ? { ...credentials, passwordHash }
        : this.platformAdminCredentialsRepository.create({ platformAdminId: admin.id, passwordHash }),
    );
  }

  /** A deactivated administrator can no longer sign in or use a token issued earlier. */
  async setActive(email: string, isActive: boolean): Promise<void> {
    const admin = await this.findByEmail(email);
    await this.platformAdminRepository.update({ id: admin.id }, { isActive });
  }

  async list(): Promise<PlatformAdmin[]> {
    return this.platformAdminRepository.find({ order: { createdAt: 'ASC' } });
  }
}
