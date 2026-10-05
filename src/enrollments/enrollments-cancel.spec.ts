import { BadRequestException, ConflictException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
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
import { EnrollmentsService } from './enrollments.service';
import { Enrollment, EnrollmentStatus } from './schemas/enrollment.schema';

describe('BE-015: cancelling an enrollment releases its seat', () => {
  const id = new Types.ObjectId();
  const student = { id: String(new Types.ObjectId()), user: new Types.ObjectId(), active: true };
  const group = {
    _id: new Types.ObjectId(), subject: new Types.ObjectId(), period: new Types.ObjectId(),
    active: true, number: 1, schedule: [], capacity: 1,
  };
  const subject = { _id: group.subject, name: 'Materia', credits: 3, prerequisites: [] };
  const actor: AuthUser = { id: String(student.user), email: 'student@example.invalid', role: Role.Estudiante };
  let module: TestingModule;
  let service: EnrollmentsService;
  let state: { status: EnrollmentStatus; enrolled: number };
  let findById: jest.Mock;
  let updateEnrollment: jest.Mock;
  let updateGroup: jest.Mock;
  let save: jest.Mock;
  let notify: jest.Mock;
  let transactionError: Error | undefined;
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };

  function document() {
    return {
      _id: id, student: new Types.ObjectId(student.id), group: group._id,
      subject: group.subject, period: group.period, status: state.status, save,
    };
  }

  beforeEach(async () => {
    state = { status: EnrollmentStatus.Active, enrolled: 1 };
    transactionError = undefined;
    save = jest.fn(async () => {
      state.status = EnrollmentStatus.Cancelled;
      return document();
    });
    const read = () => ({ exec: jest.fn(async () => document()) });
    findById = jest.fn(() => ({ ...read(), populate: jest.fn(read) }));
    updateEnrollment = jest.fn(async (
      filter: { _id: Types.ObjectId; status: EnrollmentStatus },
      update: { $set: { status: EnrollmentStatus } },
    ) => {
      if (!id.equals(filter._id) || state.status !== filter.status) return null;
      const previous = document();
      state.status = update.$set.status;
      return previous;
    });
    updateGroup = jest.fn(async (
      filter: { _id: Types.ObjectId; enrolled?: { $gt: number } },
      update: { $inc: { enrolled: number } },
    ) => {
      if (!group._id.equals(filter._id)) return null;
      if (update.$inc.enrolled < 0 && !(state.enrolled > (filter.enrolled?.$gt ?? -Infinity))) return null;
      if (update.$inc.enrolled > 0 && state.enrolled >= group.capacity) return null;
      state.enrolled += update.$inc.enrolled;
      return { ...group, enrolled: state.enrolled };
    });
    notify = jest.fn().mockResolvedValue(undefined);
    session = {
      // Simulate transaction rollback without using a database.
      withTransaction: jest.fn(async (callback: () => Promise<void>) => {
        const previous = { ...state };
        try {
          await callback();
          if (transactionError) throw transactionError;
        } catch (error) {
          state = previous;
          throw error;
        }
      }),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    module = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: getModelToken(Enrollment.name), useValue: {
          findById, findOneAndUpdate: updateEnrollment,
          findOne: jest.fn((filter: { group?: Types.ObjectId }) => ({
            exec: jest.fn(async () => filter.group && state.status === EnrollmentStatus.Cancelled ? document() : null),
          })),
          exists: jest.fn().mockResolvedValue(null),
          find: jest.fn(() => ({ select: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })) })),
        } },
        { provide: getModelToken(Group.name), useValue: { findOneAndUpdate: updateGroup } },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn().mockResolvedValue(session) } },
        { provide: StudentsService, useValue: {
          findByUserId: jest.fn().mockResolvedValue(student), findOne: jest.fn().mockResolvedValue(student),
        } },
        { provide: GroupsService, useValue: { findRaw: jest.fn().mockResolvedValue(group) } },
        { provide: SubjectsService, useValue: {
          findOne: jest.fn().mockResolvedValue(subject), totalCredits: jest.fn().mockResolvedValue(0),
        } },
        { provide: PeriodsService, useValue: { findOne: jest.fn().mockResolvedValue({ status: PeriodStatus.Open }) } },
        { provide: NotificationsService, useValue: { notify } },
      ],
    }).compile();
    service = module.get(EnrollmentsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('cancels and decrements once using the same transaction session', async () => {
    await expect(service.cancel(String(id), actor)).resolves.toMatchObject({ status: EnrollmentStatus.Cancelled });
    expect(state.enrolled).toBe(0);
    expect(updateEnrollment).toHaveBeenCalledTimes(1);
    expect(updateEnrollment).toHaveBeenCalledWith(
      { _id: id, status: EnrollmentStatus.Active },
      { $set: { status: EnrollmentStatus.Cancelled } }, { session },
    );
    expect(updateGroup).toHaveBeenCalledTimes(1);
    expect(updateGroup).toHaveBeenCalledWith(
      { _id: group._id, enrolled: { $gt: 0 } }, { $inc: { enrolled: -1 } }, { session },
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      student.user, NotificationType.EnrollmentCancelled, 'Matricula cancelada',
      `Se cancelo tu matricula en ${subject.name}.`, { model: 'Enrollment', id },
    );
  });

  it('rejects a second cancellation without releasing another seat', async () => {
    await service.cancel(String(id), actor);
    await expect(service.cancel(String(id), actor)).rejects.toThrow(BadRequestException);
    expect(state.enrolled).toBe(0);
    expect(updateGroup).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale active read when the enrollment is already cancelled', async () => {
    const stale = document();
    state = { status: EnrollmentStatus.Cancelled, enrolled: 1 };
    findById.mockImplementationOnce(() => ({ exec: jest.fn().mockResolvedValue(stale) }));
    await expect(service.cancel(String(id), actor)).rejects.toThrow(BadRequestException);
    expect(updateEnrollment).toHaveBeenCalledTimes(1);
    expect(updateGroup).not.toHaveBeenCalled();
    expect(state.enrolled).toBe(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not allow a zero seat counter to become negative', async () => {
    state.enrolled = 0;
    await expect(service.cancel(String(id), actor)).rejects.toThrow(ConflictException);
    expect(state).toEqual({ status: EnrollmentStatus.Active, enrolled: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('propagates a group update failure without confirming cancellation', async () => {
    const error = new Error('Group update failed');
    updateGroup.mockRejectedValueOnce(error);
    await expect(service.cancel(String(id), actor)).rejects.toBe(error);
    expect(state).toEqual({ status: EnrollmentStatus.Active, enrolled: 1 });
    expect(notify).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('does not confirm cancellation when the transaction fails to commit', async () => {
    transactionError = new Error('Commit failed');
    await expect(service.cancel(String(id), actor)).rejects.toBe(transactionError);
    expect(state).toEqual({ status: EnrollmentStatus.Active, enrolled: 1 });
    expect(notify).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('can reserve the seat again in a capacity-one group after cancellation', async () => {
    await service.cancel(String(id), actor);
    expect(state.enrolled).toBe(0);
    save.mockImplementationOnce(async () => {
      state.status = EnrollmentStatus.Active;
      return document();
    });
    await expect(service.enroll({ groupId: String(group._id) }, actor))
      .resolves.toMatchObject({ status: EnrollmentStatus.Active });
    expect(state.enrolled).toBe(1);
    expect(updateGroup).toHaveBeenCalledTimes(2);
    expect(updateGroup.mock.calls[1]).toEqual([
      { _id: group._id, active: true, $expr: { $lt: ['$enrolled', '$capacity'] } },
      { $inc: { enrolled: 1 } }, { session },
    ]);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
