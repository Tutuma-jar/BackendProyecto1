import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
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

describe('BE-022: update schedule contract', () => {
  const id = '507f1f77bcf86cd799439011';
  const slot = {
    day: Day.Lunes,
    startTime: '07:00',
    endTime: '09:00',
    classroom: '507f1f77bcf86cd799439012',
  };
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown): Promise<UpdateGroupDto> =>
    pipe.transform(value, { type: 'body', metatype: UpdateGroupDto });

  it.each([null, []])('rejects schedule %j in PATCH validation', async (schedule) => {
    await expect(validate({ schedule })).rejects.toThrow(BadRequestException);
  });

  it('allows schedule omission and other field updates', async () => {
    const dto = await validate({ capacity: 35 });
    expect(dto.capacity).toBe(35);
    expect(dto.schedule).toBeUndefined();
  });

  it('accepts a nonempty valid schedule', async () => {
    const dto = await validate({ schedule: [slot] });
    expect(dto.schedule).toEqual([slot]);
  });

  it('preserves nested slot validation', async () => {
    await expect(validate({ schedule: [{ ...slot, startTime: 'invalid' }] }))
      .rejects.toThrow(BadRequestException);
  });

  describe('service persistence boundary', () => {
    let module: TestingModule;
    let service: GroupsService;
    let group: {
      teacher: string;
      period: string;
      enrolled: number;
      schedule: typeof slot[];
      set: jest.Mock;
      save: jest.Mock;
    };
    let others: jest.Mock;
    let assertActive: jest.Mock;

    beforeEach(async () => {
      group = {
        teacher: '507f1f77bcf86cd799439013',
        period: '507f1f77bcf86cd799439014',
        enrolled: 0,
        schedule: [slot],
        set: jest.fn((dto: UpdateGroupDto) => Object.assign(group, dto)),
        save: jest.fn().mockResolvedValue(undefined),
      };
      others = jest.fn().mockResolvedValue([]);
      assertActive = jest.fn().mockResolvedValue(undefined);
      const exec = jest.fn().mockResolvedValue(group);
      module = await Test.createTestingModule({
        providers: [
          GroupsService,
          { provide: getModelToken(Group.name), useValue: {
            findById: jest.fn(() => ({ exec, populate: jest.fn(() => ({ exec })) })),
            find: jest.fn(() => ({ exec: others })),
          } },
          { provide: SubjectsService, useValue: {} },
          { provide: TeachersService, useValue: {} },
          { provide: PeriodsService, useValue: {} },
          { provide: ClassroomsService, useValue: { assertActive } },
          { provide: NotificationsService, useValue: {} },
        ],
      }).compile();
      service = module.get(GroupsService);
    });

    afterEach(async () => {
      await module.close();
    });

    it.each([null, []])('rejects schedule %j even without the pipe, before set/save', async (schedule) => {
      const dto = Object.assign(new UpdateGroupDto(), { schedule });
      await expect(service.update(id, dto)).rejects.toThrow(BadRequestException);
      expect(group.set).not.toHaveBeenCalled();
      expect(group.save).not.toHaveBeenCalled();
      expect(assertActive).not.toHaveBeenCalled();
      expect(others).not.toHaveBeenCalled();
    });

    it('preserves the existing schedule when omitted', async () => {
      await service.update(id, await validate({ capacity: 35 }));
      expect(group.schedule).toEqual([slot]);
      expect(group.set).toHaveBeenCalledWith(expect.objectContaining({ capacity: 35 }));
      expect(group.save).toHaveBeenCalledTimes(1);
      expect(others).not.toHaveBeenCalled();
    });

    it('saves a valid schedule after checking non-overlapping groups', async () => {
      others.mockResolvedValue([{ teacher: group.teacher, schedule: [{
        ...slot, startTime: '09:00', endTime: '10:00',
      }] }]);
      await expect(service.update(id, await validate({ schedule: [slot] }))).resolves.toBe(group);
      expect(assertActive).toHaveBeenCalledWith([slot.classroom]);
      expect(others).toHaveBeenCalledTimes(1);
      expect(group.save).toHaveBeenCalledTimes(1);
    });

    it('preserves conflict rejection for overlapping valid schedules', async () => {
      others.mockResolvedValue([{ teacher: group.teacher, schedule: [{
        ...slot, startTime: '08:00', endTime: '10:00',
      }] }]);
      await expect(service.update(id, await validate({ schedule: [slot] })))
        .rejects.toThrow(ConflictException);
      expect(group.set).not.toHaveBeenCalled();
      expect(group.save).not.toHaveBeenCalled();
    });
  });
});
