import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { User } from 'src/modules/users/entities/user.entity';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { UsersService } from 'src/modules/users/users.service';
import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { buildTenantCacheKey } from 'src/shared/utils/cache-key.util';
import { OtpService } from 'src/cache_storage/services/otp.service';
type LoginPayload = { email: string; password: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly tenantContext: TenantContextService,
    private readonly otpService: OtpService,
    private readonly logger: AppLogger,
  ) {}

  private getTenantSlug(): string {
    return this.tenantContext.requireTenant().slug;
  }

  private signupKey(identifier: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'signup', identifier);
  }

  private refreshTokenKey(userId: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'auth', 'refresh', userId);
  }

  private emailVerifiedKey(email: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'email-verified', email);
  }

  /** Maps a phone number awaiting SMS verification back to its pending signup. */
  private signupPhoneKey(phone: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'signup-phone', phone);
  }

  private resetTokenKey(email: string): string {
    return buildTenantCacheKey(this.getTenantSlug(), 'password-reset-token', email);
  }

  private phoneChangeIdentifier(userId: string, phone: string): string {
    return `${userId}:${phone}`;
  }

  private async generateToken(
    payload: Record<string, any>,
    secret: string,
    expiresIn: string,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, { secret, expiresIn: expiresIn as any });
  }

  /** Issues an access/refresh pair bound to the current tenant and stores the refresh token. */
  private async issueTokens(user: {
    id: string;
    email: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: user.id, email: user.email, tenantSlug: this.getTenantSlug() };

    const accessToken = await this.generateToken(
      payload,
      this.configService.get<string>('JWT_SECRET_KEY')!,
      '15m',
    );
    // jti makes every refresh token unique. Without it two tokens issued in the
    // same second are byte-identical, and replacing the stored one revokes nothing.
    const refreshToken = await this.generateToken(
      { ...payload, jti: randomUUID() },
      this.configService.get<string>('JWT_SECRET_KEY_REFRESH')!,
      '7d',
    );

    await this.redisService.set(
      this.refreshTokenKey(user.id),
      refreshToken,
      604800, // 7 days in seconds
    );

    return { accessToken, refreshToken };
  }

  async signUp(body: Partial<User>): Promise<{ message: string }> {
    const emailExists = await this.usersService.findByEmail(body.email!);
    if (emailExists) {
      // Answer exactly like a fresh signup so this endpoint cannot be used to
      // find out which emails are registered; tell the real owner by email.
      try {
        await this.emailService.sendEmail(
          body.email!,
          'Sign-up attempt',
          'Someone tried to create an account with this email address, but you already have one. ' +
            'If this was you, log in or reset your password. Otherwise you can ignore this message.',
        );
      } catch {
        // best effort
      }
      return { message: 'Check your email for OTP' };
    }
    // Only check phone if provided
    if (body.phone) {
      const phoneExists = await this.usersService.findByPhone(body.phone);
      if (phoneExists) {
        throw new BadRequestException('Phone number already in use');
      }
    }
    try {
      await this.redisService.set(
        this.signupKey(body.email!),
        JSON.stringify({
          email: body.email,
          phone: body.phone || null, // Store phone even if null
          username: body.username,
          // Only the hash is kept while the signup is pending.
          passwordHash: await argon2.hash(body.password!),
        }),
        86400,
      );
    } catch (error) {
      throw this.unavailable('store the pending signup', error);
    }

    // Generate and send email OTP
    try {
      const code = await this.otpService.generate('signup-email', body.email!, 'email');
      await this.emailService.sendEmail(
        body.email!,
        'Verify your email',
        `Your OTP code is: ${code}`,
      );
    } catch (error) {
      throw this.unavailable('send the email code', error);
    }

    this.logger.debug('Email OTP sent', 'AuthService');
    return { message: 'Check your email for OTP' };
  }

  async sendOtpSms(email: string, phone: string): Promise<{ message: string }> {
    // Verify signup data exists
    const signupDataRaw = await this.redisService.get(this.signupKey(email));
    if (!signupDataRaw) {
      throw new BadRequestException('Signup data not found or expired. Please sign up first.');
    }

    const signupData = JSON.parse(signupDataRaw);

    // SMS costs money and reaches third parties: only send once the email is proven.
    const emailVerified = await this.redisService.get(this.emailVerifiedKey(email));
    if (emailVerified !== 'true') {
      throw new BadRequestException('Email must be verified before requesting an SMS OTP');
    }

    // Check if phone matches the one in signup data (if phone was provided during signup)
    if (signupData.phone && signupData.phone !== phone) {
      throw new BadRequestException('Phone number does not match signup data');
    }

    // Check if phone is already in use
    const phoneExists = await this.usersService.findByPhone(phone);
    if (phoneExists) {
      throw new BadRequestException('Phone number already in use');
    }

    // Update signup data with phone number
    signupData.phone = phone;
    await this.redisService.set(this.signupKey(email), JSON.stringify(signupData), 86400);
    await this.redisService.set(this.signupPhoneKey(phone), email, 86400);

    try {
      const code = await this.otpService.generate('signup-sms', phone, 'sms');
      await this.smsService.sendSms(phone, Number(code));
    } catch (error) {
      throw this.unavailable('send the SMS code', error);
    }
    this.logger.debug('OTP SMS sent', 'AuthService');
    return { message: 'Check your phone for the OTP' };
  }

  async resendOtpSms(phone: string): Promise<{ message: string }> {
    // Pending signups are stored by email; the phone index is written by sendOtpSms.
    const email = await this.redisService.get(this.signupPhoneKey(phone));
    const signupDataRaw = email ? await this.redisService.get(this.signupKey(email)) : null;
    if (!signupDataRaw) {
      throw new BadRequestException('Signup data not found or expired');
    }
    try {
      const code = await this.otpService.generate('signup-sms', phone, 'sms');
      await this.smsService.sendSms(phone, Number(code));
    } catch (error) {
      throw this.unavailable('send the SMS code', error);
    }
    this.logger.debug('OTP SMS resent', 'AuthService');
    return { message: 'Check your phone for the new OTP' };
  }

  async resendOtpEmail(email: string): Promise<{ message: string }> {
    const signupDataRaw = await this.redisService.get(this.signupKey(email));
    if (!signupDataRaw) {
      throw new BadRequestException('Signup data not found or expired');
    }
    try {
      const code = await this.otpService.generate('signup-email', email, 'email');
      await this.emailService.sendEmail(email, 'Verify your email', `Your OTP code is: ${code}`);
    } catch (error) {
      throw this.unavailable('send the email code', error);
    }
    this.logger.debug('OTP Email resent', 'AuthService');
    return { message: 'Check your email for the new OTP' };
  }

  /**
   * A dependency (Redis, the email or SMS provider) failed. The cause goes to
   * the log, never the code itself, and the client is told to try again later:
   * this is not something wrong with its request.
   */
  private unavailable(action: string, error: unknown): ServiceUnavailableException {
    this.logger.error(`Could not ${action}`, (error as Error)?.stack, 'AuthService');
    return new ServiceUnavailableException(
      'The verification code could not be sent. Please try again in a moment.',
    );
  }

  async passwordResetOtpEmail(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (user) {
      try {
        const code = await this.otpService.generate('password-reset', email, 'email');
        await this.emailService.sendEmail(
          email,
          'Password Reset OTP',
          `Your Password Reset OTP is: ${code}`,
        );
        this.logger.debug('OTP password reset sent', 'AuthService');
      } catch (error) {
        // A delivery failure must not reveal that the account exists.
        this.logger.error(
          'Failed to generate or send password reset OTP',
          (error as Error)?.stack,
          'AuthService',
        );
      }
    }
    // Same answer whether or not the account exists (no email enumeration).
    return { message: 'If an account exists for this email, a password reset OTP has been sent' };
  }

  /**
   * Exchanges a correct reset OTP for a single-use reset token. The token, not
   * the email alone, is what authorises the password change.
   */
  async verifyResetOtpEmail(
    email: string,
    otpEmail: number,
  ): Promise<{ message: string; resetToken: string }> {
    this.logger.debug('verifyResetOtpEmail called', 'AuthService');

    const valid = await this.otpService.verify('password-reset', email, String(otpEmail));
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const resetToken = randomBytes(32).toString('hex');
    await this.redisService.set(this.resetTokenKey(email), resetToken, 600); // 10 minutes

    return { message: 'OTP verified successfully', resetToken };
  }

  async passwordReset(
    email: string,
    resetToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const invalid = new BadRequestException('Invalid or expired reset token');

    const stored = await this.redisService.get(this.resetTokenKey(email));
    if (!stored || !resetToken) {
      throw invalid;
    }
    const expected = Buffer.from(stored);
    const received = Buffer.from(resetToken);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw invalid;
    }
    // Single use, whatever happens next.
    await this.redisService.del(this.resetTokenKey(email));

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw invalid;
    }
    await this.usersService.updateUser(user.id, {
      password: newPassword,
    });
    // Sessions opened with the old password must not survive the reset.
    await this.redisService.del(this.refreshTokenKey(user.id));

    return { message: 'Password successfully reset' };
  }

  async verifyOtpEmail(email: string, otpEmail: number): Promise<{ message: string }> {
    const valid = await this.otpService.verify('signup-email', email, String(otpEmail));
    if (!valid) {
      throw new BadRequestException('Invalid or expired email OTP');
    }

    // Mark email as verified for one hour; verifyOtp() requires this flag.
    await this.redisService.set(this.emailVerifiedKey(email), 'true', 3600);

    return { message: 'Email OTP verified successfully' };
  }

  async verifyOtpSms(phone: string, otpSms: number): Promise<{ message: string }> {
    // Pre-check only: the code is consumed by verifyOtp() when the account is created.
    const valid = await this.otpService.verify('signup-sms', phone, String(otpSms), {
      consume: false,
    });
    if (!valid) {
      throw new BadRequestException('Invalid or expired SMS OTP');
    }

    return { message: 'SMS OTP verified successfully' };
  }

  async verifyOtp(
    email: string,
    phone: string | undefined,
    otpSms?: number,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const signupDataRaw = await this.redisService.get(this.signupKey(email));
    if (!signupDataRaw) {
      throw new BadRequestException('Signup data not found or expired');
    }
    const signupData = JSON.parse(signupDataRaw);

    // The email must have been verified through /auth/verify-otp-email first.
    const emailVerified = await this.redisService.get(this.emailVerifiedKey(email));
    if (emailVerified !== 'true') {
      throw new BadRequestException('Email is not verified. Verify the email OTP first.');
    }

    // Handle SMS OTP verification
    let verifiedPhone: string | undefined = undefined;

    if (otpSms && phone) {
      // SMS OTP was provided - verify it
      const valid = await this.otpService.verify('signup-sms', phone, String(otpSms));
      if (!valid) {
        throw new BadRequestException(
          'Invalid or expired SMS OTP. Please try again or skip by not providing otpSms to create account without phone.',
        );
      }
      verifiedPhone = phone;
      this.logger.debug('SMS OTP verified successfully', 'AuthService');
    } else if (!otpSms && phone) {
      // Phone provided but no SMS OTP - this means user wants to skip SMS verification
      // Don't use the phone, create account without it
      this.logger.debug('SMS OTP skipped, creating account without phone', 'AuthService');
    }
    // If neither phone nor otpSms provided, verifiedPhone stays undefined (no phone)

    // Clean up OTPs and signup data
    await this.otpService.invalidate('signup-email', email);
    await this.redisService.del(this.signupKey(email));
    await this.redisService.del(this.emailVerifiedKey(email));
    if (signupData.phone) {
      await this.redisService.del(this.signupPhoneKey(signupData.phone));
    }

    // Create user with or without phone
    const newUser = await this.usersService.createUser(
      {
        email: signupData.email,
        phone: verifiedPhone, // Will be undefined if SMS was skipped or not provided
        password: signupData.passwordHash,
        username: signupData.username,
      },
      undefined,
      { passwordIsHashed: true },
    );

    return { user: newUser, ...(await this.issueTokens(newUser)) };
  }

  async logIn(
    credentials: LoginPayload,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const { email, password } = credentials;

    const stored = await this.usersService.findCredentialsByEmail(email);
    if (!stored?.password || stored.password.trim() === '') {
      // Unknown email, or a social-login account without a password.
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await argon2.verify(stored.password, password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const existingUser = await this.usersService.findById(stored.id);
    if (!existingUser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { user: existingUser, ...(await this.issueTokens(existingUser)) };
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET_KEY_REFRESH'),
      });

      if (payload.tenantSlug !== this.getTenantSlug()) {
        throw new UnauthorizedException('Tenant mismatch in refresh token');
      }

      const storedToken = await this.redisService.get(this.refreshTokenKey(payload.sub));
      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Rotate the refresh token on every use to limit the replay window.
      return await this.issueTokens({ id: payload.sub, email: payload.email });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string): Promise<{ message: string }> {
    const deleted = await this.redisService.del(this.refreshTokenKey(userId));
    if (!deleted) {
      return { message: 'No active session found or already logged out' };
    }
    return { message: 'Successfully logged out' };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string; accessToken: string; refreshToken: string }> {
    const user = await this.usersService.findById(userId);
    const stored = await this.usersService.findCredentialsById(userId);
    if (!user || !stored) {
      throw new BadRequestException('User not found');
    }

    if (!stored.password || stored.password.trim() === '') {
      throw new BadRequestException('Password change not allowed for social login accounts');
    }

    const isOldPasswordValid = await argon2.verify(stored.password, oldPassword);
    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    await this.usersService.updateUser(user.id, { password: newPassword });

    // Replaces the stored refresh token, so every other session is signed out.
    return { message: 'Password changed successfully', ...(await this.issueTokens(user)) };
  }

  /** Sends an OTP to a new phone number the authenticated user wants to switch to. */
  async sendPhoneChangeOtp(userId: string, phone: string): Promise<{ message: string }> {
    const phoneExists = await this.usersService.findByPhone(phone);
    if (phoneExists) {
      throw new BadRequestException('Phone number already in use');
    }
    try {
      const code = await this.otpService.generate(
        'phone-change',
        this.phoneChangeIdentifier(userId, phone),
        'sms',
      );
      await this.smsService.sendSms(phone, Number(code));
    } catch {
      throw new BadRequestException('Error generating or sending SMS OTP');
    }
    return { message: 'Check your phone for the OTP' };
  }

  /**
   * Profile update for the authenticated user. A new phone number is only
   * accepted together with the OTP that was sent to it.
   */
  async updateProfile(
    userId: string,
    updates: { username?: string; phone?: string; otpSms?: number; preferredLanguage?: string },
  ): Promise<{ message: string; updatedUser: User }> {
    const { otpSms, ...fields } = updates;

    if (fields.phone) {
      const valid =
        otpSms !== undefined &&
        (await this.otpService.verify(
          'phone-change',
          this.phoneChangeIdentifier(userId, fields.phone),
          String(otpSms),
        ));
      if (!valid) {
        throw new BadRequestException(
          'A valid SMS OTP for the new phone number is required. Request one via /auth/send-otp-phone-change.',
        );
      }
    }

    return this.usersService.updateUser(userId, fields);
  }

  async loginWithGoogle(
    user: User,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    return { user, ...(await this.issueTokens(user)) };
  }

  async sendOtpDelete(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    try {
      const code = await this.otpService.generate('delete-account', email, 'email');
      await this.emailService.sendEmail(
        email,
        'Account Deletion Verification',
        `Your account deletion OTP is: ${code}. This code will expire in 15 minutes.`,
      );
    } catch {
      throw new BadRequestException('Error generating or sending OTP');
    }

    return { message: 'OTP sent to your email. Please verify to proceed with account deletion.' };
  }

  async deleteAccount(userId: string, otpEmail: number): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const valid = await this.otpService.verify('delete-account', user.email, String(otpEmail));
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP. Please request a new one.');
    }

    try {
      await this.redisService.del(this.refreshTokenKey(userId));
      await this.otpService.invalidate('signup-email', user.email);
      await this.otpService.invalidate('password-reset', user.email);
      await this.otpService.invalidate('delete-account', user.email);
      await this.redisService.del(this.signupKey(user.email));
      if (user.phone) await this.otpService.invalidate('signup-sms', user.phone);

      await this.usersService.deleteUser(userId);

      return { message: 'Account deleted successfully' };
    } catch {
      throw new BadRequestException('Failed to delete account. Please try again.');
    }
  }
}
