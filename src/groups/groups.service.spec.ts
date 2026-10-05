import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { PeriodsService } from '../periods/periods.service';
import { SubjectsService } from '../subjects/subjects.service';
import { TeachersService } from '../teachers/teachers.service';
import { GroupsService } from './groups.service';
import { Group } from './schemas/group.schema';

describe('BE-002: group management authorization', () => {
  const groupId = '000000000000000000000001';
  const teacherId = '000000000000000000000002';
  const userId = '000000000000000000000003';
  let module: TestingModule;
  let service: GroupsService;
  let findByUserId: jest.Mock;
  let exec: jest.Mock;
  let group: { teacher: Types.ObjectId };

  beforeEach(async () => {
    group = { teacher: new Types.ObjectId(teacherId) };
    exec = jest.fn().mockResolvedValue(group);
    findByUserId = jest.fn().mockResolvedValue({ id: teacherId });
    module = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: getModelToken(Group.name), useValue: { findById: jest.fn(() => ({ exec })) } },
        { provide: TeachersService, useValue: { findByUserId } },
        { provide: SubjectsService, useValue: {} },
        { provide: PeriodsService, useValue: {} },
        { provide: ClassroomsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();
    service = module.get(GroupsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('allows the teacher who owns the group', async () => {
    await expect(service.assertCanManage(groupId, {
      id: userId, email: 'synthetic@example.invalid', role: Role.Docente,
    })).resolves.toBe(group);
    expect(findByUserId).toHaveBeenCalledWith(userId);
  });

  it('rejects a teacher who does not own the group', async () => {
    findByUserId.mockResolvedValue({ id: '000000000000000000000004' });

    await expect(service.assertCanManage(groupId, {
      id: userId, email: 'synthetic@example.invalid', role: Role.Docente,
    })).rejects.toThrow(ForbiddenException);
  });

  it('allows an administrator without requiring a teacher profile', async () => {
    await expect(service.assertCanManage(groupId, {
      id: userId, email: 'synthetic@example.invalid', role: Role.Admin,
    })).resolves.toBe(group);
    expect(findByUserId).not.toHaveBeenCalled();
  });

  it('rejects students without looking up a teacher profile', async () => {
    await expect(service.assertCanManage(groupId, {
      id: userId, email: 'synthetic@example.invalid', role: Role.Estudiante,
    })).rejects.toThrow(ForbiddenException);
    expect(findByUserId).not.toHaveBeenCalled();
  });

  it('preserves the not-found error for a missing group', async () => {
    exec.mockResolvedValue(null);

    await expect(service.assertCanManage(groupId, {
      id: userId, email: 'synthetic@example.invalid', role: Role.Admin,
    })).rejects.toThrow(NotFoundException);
  });
});
