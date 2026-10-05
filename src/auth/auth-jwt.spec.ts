import { DynamicModule, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { validateEnv } from '../config/env.validation';
import { AuthModule } from './auth.module';

describe('BE-003: JWT expiration in seconds', () => {
  it.each([60, 3600])('keeps a configured lifetime of %i seconds', async (seconds) => {
    const imports: (DynamicModule | Type<unknown>)[] =
      Reflect.getMetadata('imports', AuthModule);
    const registration = imports.find(
      (item): item is DynamicModule => typeof item === 'object' && item.module === JwtModule,
    );
    if (!registration) throw new Error('AuthModule must register JwtModule');

    const config = validateEnv({
      JWT_SECRET: 'synthetic-secret-for-offline-tests-only',
      JWT_EXPIRES_IN_SECONDS: String(seconds),
      MONGODB_URI: 'mongodb://example.invalid/synthetic',
      ADMIN_EMAIL: 'synthetic@example.invalid',
      ADMIN_PASSWORD: 'synthetic-admin-password',
    });
    const module = await Test.createTestingModule({ imports: [registration] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(config))
      .compile();

    try {
      const jwt = module.get(JwtService);
      const token = jwt.sign({ sub: 'synthetic-user' });
      const payload = jwt.decode<{ iat: number; exp: number }>(token);

      expect(payload.exp - payload.iat).toBe(seconds);
      expect(jwt.verify<{ sub: string }>(token).sub).toBe('synthetic-user');
    } finally {
      await module.close();
    }
  });
});
