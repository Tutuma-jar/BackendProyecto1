import { BadRequestException, ConflictException, INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { DeletionsController } from '../deletions/deletions.controller';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

describe('BE-007: canonical evaluation routes', () => {
  const id = '507f1f77bcf86cd799439011';
  const service = {
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findOne: jest.fn().mockResolvedValue({ _id: id }),
    create: jest.fn().mockResolvedValue({ _id: id }),
    update: jest.fn().mockResolvedValue({ _id: id }),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EvaluationsController],
      providers: [{ provide: EvaluationsService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app.close();
  });

  it('lists evaluations at the canonical path', async () => {
    await request(app.getHttpServer()).get('/api/v1/evaluations').expect(200);
    expect(service.findAll).toHaveBeenCalledTimes(1);
  });

  it('gets an evaluation at the canonical path', async () => {
    await request(app.getHttpServer()).get(`/api/v1/evaluations/${id}`).expect(200);
    expect(service.findOne).toHaveBeenCalledWith(id);
  });

  it('BE-009: returns 201 and the created evaluation at the canonical path', async () => {
    const dto = { name: 'Parcial' };
    const response = await request(app.getHttpServer()).post('/api/v1/evaluations').send(dto);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledWith(dto, undefined);
    expect(response.body).toEqual({ _id: id });
    expect(response.status).toBe(201);
  });

  it.each([
    [400, new BadRequestException('Evaluacion invalida')],
    [409, new ConflictException('La evaluacion ya existe')],
  ])('BE-009: preserves HTTP %i from service exceptions', async (status, error) => {
    service.create.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer())
      .post('/api/v1/evaluations')
      .send({ name: 'Parcial' })
      .expect(status);
    expect(response.body.statusCode).toBe(status);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('updates an evaluation at the canonical path', async () => {
    const dto = { name: 'Parcial actualizado' };
    await request(app.getHttpServer())
      .patch(`/api/v1/evaluations/${id}`)
      .send(dto)
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(id, dto, undefined);
  });

  it('does not expose the misspelled route', async () => {
    await request(app.getHttpServer()).get('/api/v1/evaluationslalala').expect(404);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('preserves the canonical DELETE route without performing deletions', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DeletionsController)).toBe('/');
    expect(Reflect.getMetadata(PATH_METADATA, DeletionsController.prototype.evaluation))
      .toBe('evaluations/:id');
  });
});
