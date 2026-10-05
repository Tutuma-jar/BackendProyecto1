import { BadRequestException, ConflictException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import request = require('supertest');
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { GroupsService } from '../groups/groups.service';
import { Group } from '../groups/schemas/group.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { PeriodsService } from '../periods/periods.service';
import { PeriodStatus } from '../periods/schemas/period.schema';
import { StudentsService } from '../students/students.service';
import { SubjectsService } from '../subjects/subjects.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { Enrollment, EnrollmentStatus } from './schemas/enrollment.schema';

describe('BE-014: successful enrollment confirmation', () => {
  const student = { id: '000000000000000000000001', active: true, user: new Types.ObjectId() };
  const group = {
    _id: new Types.ObjectId(), subject: new Types.ObjectId(), period: new Types.ObjectId(),
    active: true, number: 1, schedule: [],
  };
  const subject = { _id: group.subject, name: 'Materia', credits: 3, prerequisites: [] };
  const actor: AuthUser = { id: String(student.user), email: 'student@example.invalid', role: Role.Estudiante };
  const dto = { groupId: String(group._id) };
  let module: TestingModule;
  let service: EnrollmentsService;
  let enrollment: {
    _id: Types.ObjectId;
    status: EnrollmentStatus;
    finalGrade?: number;
    save: jest.Mock;
  };
  let model: { findOne: jest.Mock; find: jest.Mock; exists: jest.Mock; create: jest.Mock };
  let reserve: jest.Mock;
  let notify: jest.Mock;
  let findPeriod: jest.Mock;
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };

  beforeEach(async () => {
    enrollment = {
      _id: new Types.ObjectId(), status: EnrollmentStatus.Active,
      save: jest.fn(async () => enrollment),
    };
    model = {
      findOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(null) })),
      find: jest.fn(() => ({ select: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })) })),
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue([enrollment]),
    };
    reserve = jest.fn().mockResolvedValue(group);
    notify = jest.fn().mockResolvedValue(undefined);
    findPeriod = jest.fn().mockResolvedValue({ status: PeriodStatus.Open });
    session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    module = await Test.createTestingModule({
      controllers: [EnrollmentsController],
      providers: [
        EnrollmentsService,
        { provide: getModelToken(Enrollment.name), useValue: model },
        { provide: getModelToken(Group.name), useValue: { findOneAndUpdate: reserve } },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn().mockResolvedValue(session) } },
        { provide: StudentsService, useValue: { findByUserId: jest.fn().mockResolvedValue(student) } },
        { provide: GroupsService, useValue: { findRaw: jest.fn().mockResolvedValue(group) } },
        { provide: SubjectsService, useValue: {
          findOne: jest.fn().mockResolvedValue(subject), totalCredits: jest.fn().mockResolvedValue(0),
        } },
        { provide: PeriodsService, useValue: { findOne: findPeriod } },
        { provide: NotificationsService, useValue: { notify } },
      ],
    }).compile();
    service = module.get(EnrollmentsService);
  });

  afterEach(async () => {
    await module.close();
  });

  function expectConfirmed() {
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledWith(
      { _id: group._id, active: true, $expr: { $lt: ['$enrolled', '$capacity'] } },
      { $inc: { enrolled: 1 } },
      { session },
    );
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      student.user, NotificationType.EnrollmentConfirmed, 'Matricula confirmada',
      `Quedaste matriculado en ${subject.name} (grupo ${group.number}).`,
      { model: 'Enrollment', id: enrollment._id },
    );
  }

  it('returns a newly created active enrollment and confirms it once', async () => {
    await expect(service.enroll(dto, actor)).resolves.toBe(enrollment);
    expect(enrollment.status).toBe(EnrollmentStatus.Active);
    expect(model.create).toHaveBeenCalledTimes(1);
    expect(model.create).toHaveBeenCalledWith([{
      student: student.id, group: group._id, subject: subject._id,
      period: group.period, status: EnrollmentStatus.Active,
    }], { session });
    expect(enrollment.save).not.toHaveBeenCalled();
    expectConfirmed();
  });

  it('reactivates a cancelled enrollment and confirms it once', async () => {
    enrollment.status = EnrollmentStatus.Cancelled;
    enrollment.finalGrade = 2;
    model.findOne.mockImplementationOnce(() => ({ exec: jest.fn().mockResolvedValue(enrollment) }));

    await expect(service.enroll(dto, actor)).resolves.toBe(enrollment);
    expect(enrollment.status).toBe(EnrollmentStatus.Active);
    expect(enrollment.finalGrade).toBeUndefined();
    expect(enrollment.save).toHaveBeenCalledTimes(1);
    expect(enrollment.save).toHaveBeenCalledWith({ session });
    expect(model.create).not.toHaveBeenCalled();
    expectConfirmed();
  });

  it('rejects unavailable seats without saving or confirming', async () => {
    reserve.mockResolvedValue(null);
    await expect(service.enroll(dto, actor)).rejects.toThrow(new ConflictException('No hay cupos disponibles en el grupo'));
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(model.create).not.toHaveBeenCalled();
    expect(enrollment.save).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a closed period before reserving or confirming', async () => {
    findPeriod.mockResolvedValue({ status: PeriodStatus.Closed });
    await expect(service.enroll(dto, actor)).rejects.toThrow(new BadRequestException('Solo se puede matricular en un periodo abierto'));
    expect(reserve).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not announce success if the saved result is not active', async () => {
    enrollment.status = EnrollmentStatus.Cancelled;
    await expect(service.enroll(dto, actor)).rejects.toThrow(new BadRequestException('No se pudo confirmar la matricula'));
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('POST /api/v1/enrollments returns 201 with the confirmed enrollment', async () => {
    const app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.use((req: Request & { user?: AuthUser }, _res: Response, next: NextFunction) => {
      req.user = actor;
      next();
    });
    await app.init();
    try {
      const response = await request(app.getHttpServer()).post('/api/v1/enrollments').send(dto).expect(201);
      expect(response.body).toMatchObject({ _id: String(enrollment._id), status: EnrollmentStatus.Active });
      expect(model.create).toHaveBeenCalledTimes(1);
      expectConfirmed();
    } finally {
      await app.close();
    }
  });
});
