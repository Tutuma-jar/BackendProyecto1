import { ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ClassroomsService } from '../classrooms/classrooms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PeriodsService } from '../periods/periods.service';
import { SubjectsService } from '../subjects/subjects.service';
import { TeachersService } from '../teachers/teachers.service';
import { UpdateGroupDto } from './dto/group.dto';
import { GroupsService } from './groups.service';
import { Day, Group } from './schemas/group.schema';

describe('BE-020: group reactivation conflicts', () => {
  const id = '507f1f77bcf86cd799439011';
  const teacher = '507f1f77bcf86cd799439012';
  const otherTeacher = '507f1f77bcf86cd799439013';
  const period = '507f1f77bcf86cd799439014';
  const slot = {
    day: Day.Lunes,
    startTime: '08:00',
    endTime: '10:00',
    classroom: '507f1f77bcf86cd799439015',
  };
  let module: TestingModule;
  let service: GroupsService;
  let group: {
    active: boolean;
    teacher: string;
    period: string;
    enrolled: number;
    schedule: typeof slot[];
    set: jest.Mock;
    save: jest.Mock;
  };
  let find: jest.Mock;
  let others: jest.Mock;

  beforeEach(async () => {
    group = {
      active: false,
      teacher,
      period,
      enrolled: 0,
      schedule: [slot],
      set: jest.fn((dto: UpdateGroupDto) => Object.assign(group, dto)),
      save: jest.fn().mockResolvedValue(undefined),
    };
    others = jest.fn().mockResolvedValue([]);
    find = jest.fn(() => ({ exec: others }));
    const exec = jest.fn().mockResolvedValue(group);
    module = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: getModelToken(Group.name), useValue: {
          findById: jest.fn(() => ({ exec, populate: jest.fn(() => ({ exec })) })),
          find,
        } },
        { provide: SubjectsService, useValue: {} },
        { provide: TeachersService, useValue: {} },
        { provide: PeriodsService, useValue: {} },
        { provide: ClassroomsService, useValue: {
          assertActive: jest.fn().mockResolvedValue(undefined),
          codeOf: jest.fn().mockResolvedValue('A-101'),
        } },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();
    service = module.get(GroupsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('rejects reactivation when the teacher already has an overlapping class', async () => {
    others.mockResolvedValue([{ teacher, schedule: [{
      ...slot, classroom: '507f1f77bcf86cd799439016',
    }] }]);
    await expect(service.update(id, { active: true })).rejects.toThrow(ConflictException);
    expect(group.set).not.toHaveBeenCalled();
    expect(group.save).not.toHaveBeenCalled();
    expect(group.active).toBe(false);
  });

  it('rejects reactivation when the classroom is occupied by another teacher', async () => {
    others.mockResolvedValue([{ teacher: otherTeacher, schedule: [slot] }]);
    await expect(service.update(id, { active: true })).rejects.toThrow(ConflictException);
    expect(group.set).not.toHaveBeenCalled();
    expect(group.save).not.toHaveBeenCalled();
    expect(group.active).toBe(false);
  });

  it('reactivates without conflicts and excludes its own ID from active groups', async () => {
    await expect(service.update(id, { active: true })).resolves.toBe(group);
    expect(find).toHaveBeenCalledWith({
      period,
      active: true,
      _id: { $ne: id },
      $or: [{ teacher }, { 'schedule.classroom': { $in: [slot.classroom] } }],
    });
    expect(group.active).toBe(true);
    expect(group.save).toHaveBeenCalledTimes(1);
  });

  it('allows reactivation alongside a non-overlapping valid schedule', async () => {
    others.mockResolvedValue([{ teacher, schedule: [{
      ...slot, startTime: '10:00', endTime: '12:00',
    }] }]);
    await expect(service.update(id, { active: true })).resolves.toBe(group);
    expect(others).toHaveBeenCalledTimes(1);
    expect(group.active).toBe(true);
  });

  it('does not block deactivation because of conflicts', async () => {
    group.active = true;
    others.mockResolvedValue([{ teacher, schedule: [slot] }]);
    await expect(service.update(id, { active: false })).resolves.toBe(group);
    expect(find).not.toHaveBeenCalled();
    expect(group.active).toBe(false);
    expect(group.save).toHaveBeenCalledTimes(1);
  });

  it('does not treat active=true on an already active group as reactivation', async () => {
    group.active = true;
    await service.update(id, { active: true });
    expect(find).not.toHaveBeenCalled();
    expect(group.save).toHaveBeenCalledTimes(1);
  });

  it('checks the resulting schedule when reactivation also changes it', async () => {
    const newSlot = { ...slot, startTime: '10:00', endTime: '12:00' };
    others.mockResolvedValue([{ teacher, schedule: [slot] }]);
    await expect(service.update(id, { active: true, schedule: [newSlot] })).resolves.toBe(group);
    expect(group.schedule).toEqual([newSlot]);
    expect(group.active).toBe(true);
    expect(others).toHaveBeenCalledTimes(1);
  });
});
