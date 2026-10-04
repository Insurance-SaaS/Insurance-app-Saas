import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  StrategyOptions,
  VerifyCallback,
  Profile,
} from 'passport-google-oauth20';
import { UsersService } from 'src/modules/users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  /** Google sign-in is optional: without these three settings it is switched off. */
  static isConfigured(configService: ConfigService): boolean {
    return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'].every((name) =>
      Boolean(configService.get<string>(name)),
    );
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.get<string>('GOOGLE_CALLBACK_URL');

    if (!clientID || !clientSecret || !callbackURL) {
      throw new Error('Missing Google OAuth configuration');
    }

    const options: StrategyOptions = {
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    };

    super(options);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { name, emails, photos } = profile;
    const email = emails?.[0]?.value;

    if (!email) {
      return done(new Error('No email from Google'), false);
    }

    try {
      // Check if user already exists
      let user = await this.usersService.findByEmail(email);

      if (!user) {
        // Create new user
        const username =
          `${name?.givenName ?? ''}${name?.familyName ?? ''}`.toLowerCase();

        const userData = {
          email,
          username,
          password: undefined, // null since Google user won't use password
          phone: undefined, // you can leave this null for OAuth users
          profilePictureUrl: photos?.[0]?.value ?? undefined,
        };

        user = await this.usersService.createUser(userData);
      }

      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}
