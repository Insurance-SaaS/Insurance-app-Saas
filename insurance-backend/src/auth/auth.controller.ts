import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Patch,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

import { AuthService } from './auth.service';
import { UsersService } from 'src/modules/users/users.service';
import { UserLoginDto } from './dtos/user-login.dto';
import { UserSignupDto } from './dtos/user-signup.dto';
import { FastifyRequest } from 'fastify';
import { VerifyOtpDto } from './dtos/verify-otp.dto';
import { VerifyOtpSmsDto } from './dtos/verify-otp-sms.dto';
import { VerifyOtpEmailDto } from './dtos/verify-otp-email.dto';
import { SendOtpSmsDto } from './dtos/send-otp-sms.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConsumes,
  ApiResponse,
} from '@nestjs/swagger';
import {
  ValidationErrorResponseDto,
  InternalServerErrorResponseDto,
} from 'src/shared/dtos/error-response.dto';
import { UpdateUserDto } from './dtos/user-update.dto';
import { AppLogger } from 'src/shared/logger/app-logger.service';

import { ConfigService } from '@nestjs/config';
import { UpdatePassDto } from './dtos/update-password.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import {
  DeleteAccountDto,
  EmailOnlyDto,
  GoogleMobileLoginDto,
  PhoneOnlyDto,
  RefreshTokenDto,
  VerifyResetOtpDto,
} from './dtos/auth-requests.dto';
import { MinioService } from 'src/cache_storage/services/minio.service';
import { Throttle } from '@nestjs/throttler';
import { Public } from 'src/auth/decorators/public.decorator';
import { readMultipart } from 'src/shared/uploads/multipart-reader';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
    private readonly logger: AppLogger,
  ) {}

  @Public()
  @Post('signup')
  @ApiOperation({
    summary: 'Step 1: Sign up and receive email OTP',
    description: `
      This is the first step in the registration process. User provides their information and receives an email OTP.
      
      **Flow:**
      1. User provides email, password, username, and optional phone number
      2. System sends email OTP to the provided email address
      3. User must verify email OTP using /auth/verify-otp-email before proceeding
      
      **Next Steps:**
      - Call /auth/verify-otp-email to verify the email OTP
      - (Optional) Call /auth/send-otp-sms to send SMS OTP
      - Call /auth/verify-otp to create the account
    `,
  })
  @ApiCreatedResponse({
    description: 'Signup successful, email OTP sent',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Check your email for OTP',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or email/phone already in use',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @ApiBody({ type: UserSignupDto })
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 3, ttl: 60000 } })
  async signUp(@Body() body: UserSignupDto, @Req() req: any) {
    this.logger.log('signup request', 'AuthController', { requestId: req?.requestId });
    return this.authService.signUp(body);
  }
  @Public()
  @Post('verify-otp-email')
  @ApiOperation({
    summary: 'Step 2: Verify email OTP (does not create user)',
    description: `
      This endpoint verifies the email OTP received during signup. **This step is REQUIRED** before creating the account.
      
      **Flow:**
      1. User receives email OTP from /auth/signup
      2. User enters the OTP here to verify email
      3. Email is marked as verified (valid for 1 hour)
      4. User can now proceed to SMS verification (optional) or account creation
      
      **Next Steps:**
      - (Optional) Call /auth/send-otp-sms to send SMS OTP
      - Call /auth/verify-otp to create the account
      
      **Note:** This endpoint does NOT create a user account. It only verifies the email.
    `,
  })
  @ApiOkResponse({
    description: 'Email OTP verified successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Email OTP verified successfully',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired email OTP',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @ApiBody({ type: VerifyOtpEmailDto })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async verifyOtpEmail(@Body() body: VerifyOtpEmailDto, @Req() req: any) {
    this.logger.log('verify-otp-email request', 'AuthController', { requestId: req?.requestId });
    return this.authService.verifyOtpEmail(body.email, body.otpEmail);
  }

  @Public()
  @Post('verify-otp-sms')
  @ApiOperation({
    summary: 'Verify SMS OTP only (does not create user)',
    description: `
      This endpoint verifies the SMS OTP without creating a user account.
      
      **Use Case:**
      - Verify SMS OTP before proceeding to account creation
      - Allows user to confirm SMS OTP is correct before final account creation
      
      **Flow:**
      1. User receives SMS OTP via /auth/send-otp-sms
      2. User verifies SMS OTP using this endpoint
      3. User proceeds to /auth/verify-otp to create account
      
      **Note:** This endpoint does NOT create a user account. Use /auth/verify-otp to create the account after verification.
    `,
  })
  @ApiOkResponse({
    description: 'SMS OTP verified successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'SMS OTP verified successfully',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired SMS OTP',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @ApiBody({ type: VerifyOtpSmsDto })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async verifyOtpSms(@Body() body: VerifyOtpSmsDto, @Req() req: any) {
    this.logger.log('verify-otp-sms request', 'AuthController', { requestId: req?.requestId });
    return this.authService.verifyOtpSms(body.phone, body.otpSms);
  }

  @Public()
  @Post('verify-otp')
  @ApiOperation({
    summary: 'Create user account after email verification (and optional SMS verification)',
    description: `
      This endpoint creates the user account. **Email MUST be verified first** using /auth/verify-otp-email endpoint.
      
      **Required Flow:**
      1. Call /auth/verify-otp-email to verify email first (REQUIRED)
      2. (Optional) Call /auth/send-otp-sms to send SMS OTP
      3. Call this endpoint to create account
      
      **SMS Verification (Optional):**
      - If SMS OTP is provided and correct → user is created WITH phone number
      - If SMS OTP is provided but wrong → returns error (user can retry or skip)
      - If SMS OTP is not provided → user is created WITHOUT phone number (skip SMS)
      
      **To skip SMS verification:** Simply don't include 'otpSms' in the request body.
    `,
  })
  @ApiOkResponse({
    description: 'OTP verified successfully, user account created',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          description: 'Created user object',
        },
        accessToken: {
          type: 'string',
          description: 'JWT access token',
        },
        refreshToken: {
          type: 'string',
          description: 'JWT refresh token',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired OTP',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @ApiBody({ type: VerifyOtpDto })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async verifyOtp(@Body() body: VerifyOtpDto, @Req() req: any) {
    this.logger.log('verify-otp request', 'AuthController', { requestId: req?.requestId });
    return this.authService.verifyOtp(body.email, body.phone, body.otpSms);
  }

  @Public()
  @Post('send-otp-sms')
  @ApiOperation({
    summary: 'Step 3 (Optional): Send SMS OTP',
    description: `
      This endpoint sends an SMS OTP to the user's phone number. **This step is OPTIONAL**.
      
      **Prerequisites:**
      - User must have signed up via /auth/signup
      - Email must be verified via /auth/verify-otp-email
      
      **Flow:**
      1. User provides email and phone number
      2. System sends SMS OTP to the provided phone number
      3. User can verify SMS OTP using /auth/verify-otp-sms (optional)
      4. User proceeds to /auth/verify-otp to create account
      
      **Next Steps:**
      - (Optional) Call /auth/verify-otp-sms to verify SMS OTP
      - Call /auth/verify-otp to create the account (with or without SMS verification)
      
      **Note:** SMS verification is optional. User can skip it and create account without phone number.
    `,
  })
  @ApiOkResponse({
    description: 'SMS OTP sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Check your phone for the OTP',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Signup data not found, email not verified, or phone already in use',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  @ApiBody({ type: SendOtpSmsDto })
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async sendOtpSms(@Body() body: SendOtpSmsDto) {
    return this.authService.sendOtpSms(body.email, body.phone);
  }
  @Public()
  @Post('reset-password-otp')
  @ApiOperation({ summary: 'Send password reset OTP to email' })
  @ApiOkResponse({ description: 'OTP sent to email' })
  @ApiBadRequestResponse({ description: 'Email not found' })
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async resetPasswordOtp(@Body() body: EmailOnlyDto) {
    return this.authService.passwordResetOtpEmail(body.email);
  }

  @Public()
  @Post('verify-otp-reset')
  @ApiOperation({
    summary: 'Verify password reset OTP',
    description:
      'Returns a single-use resetToken (valid 10 minutes) that /auth/reset-password requires.',
  })
  @ApiOkResponse({ description: 'OTP verified; resetToken returned' })
  @ApiBadRequestResponse({ description: 'Invalid OTP' })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async verifyOtpReset(@Body() body: VerifyResetOtpDto) {
    return this.authService.verifyResetOtpEmail(body.email, body.otpEmail);
  }

  @Public()
  @Patch('reset-password')
  @ApiOperation({ summary: 'Reset password using the resetToken from /auth/verify-otp-reset' })
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() body: UpdatePassDto) {
    return this.authService.passwordReset(body.email, body.resetToken, body.newPassword);
  }

  @Public()
  @Post('resend-otp-sms')
  @ApiOperation({ summary: 'Resend OTP via SMS' })
  @ApiOkResponse({ description: 'OTP resent via SMS' })
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async resendOtpSms(@Body() body: PhoneOnlyDto) {
    return this.authService.resendOtpSms(body.phone);
  }

  @Public()
  @Post('resend-otp-email')
  @ApiOperation({ summary: 'Resend OTP via Email' })
  @ApiOkResponse({ description: 'OTP resent via Email' })
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async resendOtpEmail(@Body() body: EmailOnlyDto) {
    return this.authService.resendOtpEmail(body.email);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiOkResponse({ description: 'Logged in successfully' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiBody({ type: UserLoginDto })
  @Throttle({ medium: { limit: 5, ttl: 60000 } })
  async login(@Body() body: UserLoginDto) {
    this.logger.log('login request', 'AuthController');
    return this.authService.logIn(body);
  }
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiOkResponse({ description: 'Tokens refreshed' })
  @ApiBadRequestResponse({ description: 'Invalid refresh token' })
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }
  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth2 login' })
  async googleAuth() {
    // no implementation needed
  }
  @Public()
  @Get('google/redirect')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google OAuth2 redirect handler' })
  async googleAuthRedirect(@Req() req) {
    const result = await this.authService.loginWithGoogle(req.user);
    this.logger.log('google redirect', 'AuthController');

    return {
      message: 'Google login successful',
      ...result,
    };
  }
  @Public()
  @Post('google/mobile')
  @ApiOperation({ summary: 'Login with Google on mobile using ID token' })
  @ApiOkResponse({ description: 'Logged in with Google' })
  @ApiBadRequestResponse({
    description: 'Invalid Google ID token',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async googleAuthMobile(@Body() body: GoogleMobileLoginDto) {
    const audience = [
      this.configService.get<string>('GOOGLE_WEB_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
    ].filter((id): id is string => Boolean(id));
    if (audience.length === 0) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await new OAuth2Client().verifyIdToken({
        idToken: body.idToken.trim(),
        audience,
      });
      payload = ticket.getPayload();
    } catch (error) {
      // Forged, expired or issued for another application: the caller's problem, not ours.
      this.logger.warn(`Google ID token rejected: ${(error as Error).message}`, 'AuthController');
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload?.email) {
      throw new BadRequestException('Invalid Google ID Token - no email found');
    }
    // An unverified Google email could belong to someone else's account here.
    if (!payload.email_verified) {
      throw new BadRequestException('Google account email is not verified');
    }

    // Find or create user
    let user = await this.usersService.findByEmail(payload.email);
    user ??= await this.usersService.createUser({
      email: payload.email,
      username: payload.name ?? payload.email.split('@')[0],
      profilePictureUrl: payload.picture,
    });

    return this.authService.loginWithGoogle(user);
  }
  @Patch('change-password')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change password (requires old password)' })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized or old password incorrect' })
  async changePassword(@Req() req: FastifyRequest, @Body() body: ChangePasswordDto) {
    if (!req.user) {
      return null;
    }
    return this.authService.changePassword(req.user.id, body.oldPassword, body.newPassword);
  }
  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'Returns the authenticated user profile' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async getProfile(@Req() req: FastifyRequest) {
    if (!req.user) {
      return null;
    }

    let signedProfileUrl: string | undefined = undefined;

    try {
      if (req.user.profilePictureUrl) {
        this.logger.debug('Original URL', 'AuthController');

        const signed = await this.minioService.getPresignedGetUrl(req.user.profilePictureUrl, 3600);

        this.logger.debug('Presigned URL generated', 'AuthController');

        if (signed) {
          signedProfileUrl = signed;
        } else {
          this.logger.warn('Failed to generate presigned URL', 'AuthController');
        }
      }
    } catch (error) {
      this.logger.error(
        'Error in getProfile presigned URL generation',
        (error as any)?.stack,
        'AuthController',
      );
    }

    return {
      username: req.user.username,
      email: req.user.email,
      phone: req.user.phone,
      profilePictureUrl: signedProfileUrl || req.user.profilePictureUrl,
    };
  }

  @Patch('update-profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiOkResponse({ description: 'Profile updated' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async updateProfile(@Req() req: FastifyRequest, @Body() body: UpdateUserDto) {
    if (!req.user) {
      return null;
    }
    return this.authService.updateProfile(req.user.id, body);
  }

  @Post('send-otp-phone-change')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Send an OTP to a new phone number',
    description: 'First step of changing the phone number; pass the OTP to /auth/update-profile.',
  })
  @ApiOkResponse({ description: 'OTP sent to the new phone number' })
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  async sendOtpPhoneChange(@Req() req: FastifyRequest, @Body() body: PhoneOnlyDto) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.authService.sendPhoneChangeOtp(req.user.id, body.phone);
  }
  @Post('logout')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout current user' })
  @ApiOkResponse({ description: 'Logged out successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async logout(@Req() req: FastifyRequest): Promise<{ message: string } | null> {
    if (!req.user) {
      return null;
    }
    return this.authService.logout(req.user.id);
  }

  @Patch('upload-profile-picture')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Profile picture uploaded' })
  @ApiBadRequestResponse({ description: 'No picture uploaded' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async uploadProfilePicture(@Req() req: any) {
    const { files } = await readMultipart(req, {
      fileFields: ['file', 'picture', 'photo', 'image'],
      maxFiles: 1,
      accept: 'images',
    });
    if (files.length === 0) {
      throw new BadRequestException('No picture uploaded');
    }
    return this.usersService.updatePhoto(req.user.id, files[0]);
  }
  @Post('send-otp-delete')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Send OTP to verify account deletion' })
  @ApiOkResponse({ description: 'OTP sent to email' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Failed to send OTP' })
  async sendOtpDelete(@Req() req: FastifyRequest): Promise<{ message: string } | null> {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (!req.user.email) {
      throw new BadRequestException('User email not found');
    }

    this.logger.log('Send delete OTP request', 'AuthController', {
      userId: req.user.id,
      email: req.user.email,
    });

    return this.authService.sendOtpDelete(req.user.email);
  }

  @Post('delete-account')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete account after OTP verification' })
  @ApiOkResponse({ description: 'Account deleted successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiBadRequestResponse({ description: 'Invalid OTP or failed to delete account' })
  async deleteAccount(
    @Req() req: FastifyRequest,
    @Body() body: DeleteAccountDto,
  ): Promise<{ message: string } | null> {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    this.logger.log('Delete account request', 'AuthController', {
      userId: req.user.id,
    });

    return this.authService.deleteAccount(req.user.id, body.otpEmail);
  }
}
