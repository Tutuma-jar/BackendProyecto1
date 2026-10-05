import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request = require('supertest');
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('BE-005: user profile route precedence', () => {
  const userId = '000000000000000000000001';
  const otherId = '000000000000000000000002';
  let app: INestApplication;
  let actor: AuthUser;
  let findOne: jest.Mock;

  beforeEach(async () => {
    actor = { id: userId, email: 'synthetic@example.invalid', role: Role.Admin };
    findOne = jest.fn(async (id: string) => ({ id }));
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: { findOne } },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: Request & { user: AuthUser }, _res: Response, next: NextFunction) => {
      req.user = actor;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([Role.Admin, Role.Docente, Role.Estudiante])(
    'returns the current profile for role %s', async (role) => {
      actor.role = role;

      const response = await request(app.getHttpServer()).get('/api/v1/users/me');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: userId });
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenCalledWith(userId);
    },
  );

  it('preserves lookup by ID for an administrator', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/users/${otherId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: otherId });
    expect(findOne).toHaveBeenCalledWith(otherId);
  });

  it('preserves rejection of an invalid ID', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/users/invalid-id');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('ID invalido');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('does not grant teachers access to the admin-only ID route', async () => {
    actor.role = Role.Docente;

    const response = await request(app.getHttpServer()).get(`/api/v1/users/${otherId}`);

    expect(response.status).toBe(403);
    expect(findOne).not.toHaveBeenCalled();
  });
});
