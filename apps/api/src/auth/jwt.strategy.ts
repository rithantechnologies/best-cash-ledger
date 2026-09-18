import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../users/users.service.js';

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'development-only-secret') {
    throw new Error('JWT_SECRET must be configured securely');
  }
  return secret;
}

function cookieToken(req: Request) {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const item of cookie.split(';')) {
    const [name, ...value] = item.trim().split('=');
    if (name === 'cashledger_session') {
      return decodeURIComponent(value.join('='));
    }
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieToken,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: { sub: string; role: string; email?: string }) {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    return {
      userId: user.id,
      role: user.role.name,
      email: user.email,
    };
  }
}
