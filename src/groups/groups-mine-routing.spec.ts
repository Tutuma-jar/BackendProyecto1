import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request = require('supertest');
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { GroupsQueryDto } from './dto/group.dto';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

describe('BE-006: teacher group route precedence', () => {
  const userId = '000000000000000000000001';
  const groupId = '000000000000000000000002';
  const periodId = '000000000000000000000003';
  let app: INestApplication;
  let actor: AuthUser;
  let findMine: jest.Mock;
  let findOne: jest.Mock;

  beforeEach(async () => {
    actor = { id: userId, email: 'synthetic@example.invalid', role: Role.Docente };
    findMine = jest.fn().mockResolvedValue({ data: [] });
    findOne = jest.fn(async (id: string) => ({ id }));
    const module = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: { findMine, findOne } },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, transform: true, forbidNonWhitelisted: true,
    }));
    app.use((req: Request & { user: AuthUser }, _res: Response, next: NextFunction) => {
      req.user = actor;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('passes the teacher ID and transformed filters to findMine', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/groups/mine')
      .query({ period: periodId, page: '2', active: 'false' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
    expect(findMine).toHaveBeenCalledTimes(1);
    expect(findMine).toHaveBeenCalledWith(userId, expect.objectContaining({
      period: periodId, page: 2, limit: 20, active: false,
    }));
    expect(findOne).not.toHaveBeenCalled();
  });

  it('preserves default pagination without filters', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/groups/mine');

    expect(response.status).toBe(200);
    expect(findMine).toHaveBeenCalledWith(userId, expect.any(GroupsQueryDto));
    expect(findMine).toHaveBeenCalledWith(userId, expect.objectContaining({ page: 1, limit: 20 }));
  });

  it.each([Role.Admin, Role.Estudiante])('rejects role %s on the teacher-only route', async (role) => {
    actor.role = role;

    const response = await request(app.getHttpServer()).get('/api/v1/groups/mine');

    expect(response.status).toBe(403);
    expect(findMine).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('preserves lookup by a valid group ID', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/groups/${groupId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: groupId });
    expect(findOne).toHaveBeenCalledWith(groupId);
    expect(findMine).not.toHaveBeenCalled();
  });

  it('preserves rejection of an invalid group ID', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/groups/invalid-id');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('ID invalido');
    expect(findOne).not.toHaveBeenCalled();
  });

  it('validates filters before invoking findMine', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/groups/mine')
      .query({ period: 'invalid-id' });

    expect(response.status).toBe(400);
    expect(findMine).not.toHaveBeenCalled();
    expect(findOne).not.toHaveBeenCalled();
  });
});
