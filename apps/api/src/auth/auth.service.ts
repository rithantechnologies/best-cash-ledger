import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';

type Attempt = { count: number; firstAt: number };

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  private attemptKey(email: string, ip?: string) {
    return email.toLowerCase() + '|' + (ip ?? 'unknown');
  }

  private checkRateLimit(key: string) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const item = this.attempts.get(key);
    if (!item || now - item.firstAt > windowMs) {
      this.attempts.set(key, { count: 0, firstAt: now });
      return;
    }
    if (item.count >= 5) {
      throw new HttpException(
        'Too many sign-in attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private failedAttempt(key: string) {
    const now = Date.now();
    const item = this.attempts.get(key);
    if (!item || now - item.firstAt > 15 * 60 * 1000) {
      this.attempts.set(key, { count: 1, firstAt: now });
    } else {
      item.count += 1;
      this.attempts.set(key, item);
    }
  }

  async login(email: string, password: string, ip?: string) {
    const normalizedEmail = email.toLowerCase();
    const key = this.attemptKey(normalizedEmail, ip);
    this.checkRateLimit(key);

    const user = await this.users.findByEmail(normalizedEmail);
    if (!user || !user.isActive) {
      this.failedAttempt(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      this.failedAttempt(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.attempts.delete(key);
    await this.users.markLogin(user.id);

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role.name,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role.name,
      },
    };
  }
}
