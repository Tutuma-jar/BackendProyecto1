import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { Grade } from '../grades/schemas/grade.schema';
import { GroupsService } from '../groups/groups.service';
import { PeriodsService } from '../periods/periods.service';
import { PeriodStatus } from '../periods/schemas/period.schema';
import { UpdateEvaluationDto } from './dto/evaluation.dto';
import { EvaluationsService } from './evaluations.service';
import { Evaluation } from './schemas/evaluation.schema';

describe('BE-010: evaluation updates in closed periods', () => {
  const evaluationId = '000000000000000000000001';
  const groupId = '000000000000000000000002';
  const periodId = '000000000000000000000003';
  const actor: AuthUser = {
    id: '000000000000000000000004',
    email: 'synthetic@example.invalid',
    role: Role.Admin,
  };
  const changes: UpdateEvaluationDto[] = [{ name: 'Updated' }, { weight: 50 }];
  let module: TestingModule;
  let service: EvaluationsService;
  let assertCanManage: jest.Mock;
  let findPeriod: jest.Mock;
  let findEvaluation: jest.Mock;
  let gradesExist: jest.Mock;
  let otherWeights: jest.Mock;
  let evaluation: {
    _id: Types.ObjectId;
    group: Types.ObjectId;
    name: string;
    weight: number;
    set: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    evaluation = {
      _id: new Types.ObjectId(evaluationId),
      group: new Types.ObjectId(groupId),
      name: 'Original',
      weight: 25,
      set: jest.fn((dto: UpdateEvaluationDto) => Object.assign(evaluation, dto)),
      save: jest.fn(async () => evaluation),
    };
    findEvaluation = jest.fn().mockResolvedValue(evaluation);
    assertCanManage = jest.fn().mockResolvedValue({ period: new Types.ObjectId(periodId) });
    findPeriod = jest.fn().mockResolvedValue({ status: PeriodStatus.Open });
    gradesExist = jest.fn().mockResolvedValue(false);
    otherWeights = jest.fn().mockResolvedValue([{ weight: 25 }]);
    module = await Test.createTestingModule({
      providers: [
        EvaluationsService,
        { provide: getModelToken(Evaluation.name), useValue: {
          findById: jest.fn(() => ({ exec: findEvaluation })),
          find: jest.fn(() => ({ select: jest.fn(() => ({ exec: otherWeights })) })),
        } },
        { provide: getModelToken(Grade.name), useValue: { exists: gradesExist } },
        { provide: GroupsService, useValue: { assertCanManage } },
        { provide: PeriodsService, useValue: { findOne: findPeriod } },
      ],
    }).compile();
    service = module.get(EvaluationsService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe.each([Role.Admin, Role.Docente])('authorized role %s', (role) => {
    it.each(changes)('rejects changes %j in a closed period', async (dto) => {
      findPeriod.mockResolvedValue({ status: PeriodStatus.Closed });

      await expect(service.update(evaluationId, dto, { ...actor, role }))
        .rejects.toThrow(BadRequestException);

      expect(findPeriod).toHaveBeenCalledWith(periodId);
      expect(evaluation.set).not.toHaveBeenCalled();
      expect(evaluation.save).not.toHaveBeenCalled();
    });
  });

  it.each(changes)('allows valid changes %j in an open period', async (dto) => {
    await expect(service.update(evaluationId, dto, actor)).resolves.toBe(evaluation);

    expect(assertCanManage).toHaveBeenCalledWith(groupId, actor);
    expect(findPeriod).toHaveBeenCalledWith(periodId);
    expect(evaluation.set).toHaveBeenCalledWith(dto);
    expect(evaluation.save).toHaveBeenCalledTimes(1);
  });

  it('preserves the conflict when changing a weight with existing grades', async () => {
    gradesExist.mockResolvedValue(true);

    await expect(service.update(evaluationId, { weight: 50 }, actor))
      .rejects.toThrow(ConflictException);

    expect(evaluation.set).not.toHaveBeenCalled();
    expect(evaluation.save).not.toHaveBeenCalled();
  });

  it('preserves the rejection when weights would exceed 100', async () => {
    otherWeights.mockResolvedValue([{ weight: 80 }]);

    await expect(service.update(evaluationId, { weight: 50 }, actor))
      .rejects.toThrow(BadRequestException);

    expect(evaluation.set).not.toHaveBeenCalled();
    expect(evaluation.save).not.toHaveBeenCalled();
  });

  it('checks group authorization before period state or updates', async () => {
    assertCanManage.mockRejectedValue(new ForbiddenException());

    await expect(service.update(evaluationId, { name: 'Updated' }, actor))
      .rejects.toThrow(ForbiddenException);

    expect(findPeriod).not.toHaveBeenCalled();
    expect(evaluation.set).not.toHaveBeenCalled();
    expect(evaluation.save).not.toHaveBeenCalled();
  });

  it('preserves the not-found error for a missing evaluation', async () => {
    findEvaluation.mockResolvedValue(null);

    await expect(service.update(evaluationId, { name: 'Updated' }, actor))
      .rejects.toThrow(NotFoundException);

    expect(assertCanManage).not.toHaveBeenCalled();
    expect(evaluation.save).not.toHaveBeenCalled();
  });
});
