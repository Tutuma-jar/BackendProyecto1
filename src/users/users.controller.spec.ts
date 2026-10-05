import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { Role } from '../common/enums/role.enum';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('BE-008: user creation HTTP status', () => {
  const dto = {
    name: 'Maria Lopez',
    email: 'maria@example.com',
    password: 'Clave12345',
    role: Role.Estudiante,
  };
  const createdUser = {
    id: '507f1f77bcf86cd799439011',
    name: dto.name,
    email: dto.email,
    role: dto.role,
  };
  const service = { create: jest.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  beforeEach(() => {
    service.create.mockReset();
    service.create.mockResolvedValue({ ...createdUser, password: 'stored-hash' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 201 and the public user body after successful creation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send(dto);

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(response.body).toEqual(createdUser);
    expect(response.status).toBe(201);
  });

  it('returns 400 for an invalid DTO without calling the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send({ ...dto, email: 'invalid-email' })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('preserves 409 when the service reports a conflict', async () => {
    service.create.mockRejectedValueOnce(new ConflictException('El correo ya existe'));
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .send(dto)
      .expect(409);

    expect(response.body.statusCode).toBe(409);
    expect(service.create).toHaveBeenCalledTimes(1);
  });
});
