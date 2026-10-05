import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { Paginated, paginate } from '../common/dto/pagination-query.dto';
import { GroupsService } from '../groups/groups.service';
import { Grade, GradeDocument } from '../grades/schemas/grade.schema';
import { PeriodsService } from '../periods/periods.service';
import { PeriodStatus } from '../periods/schemas/period.schema';
import { CreateEvaluationDto, EvaluationsQueryDto, UpdateEvaluationDto } from './dto/evaluation.dto';
import { Evaluation, EvaluationDocument } from './schemas/evaluation.schema';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectModel(Evaluation.name) private readonly model: Model<EvaluationDocument>,
    @InjectModel(Grade.name) private readonly gradeModel: Model<GradeDocument>,
    private readonly groupsService: GroupsService,
    private readonly periodsService: PeriodsService,
  ) {}

  async create(dto: CreateEvaluationDto, user: AuthUser): Promise<EvaluationDocument> {
    const group = await this.groupsService.assertCanManage(dto.group, user);
    const period = await this.periodsService.findOne(String(group.period));
    if (period.status === PeriodStatus.Closed) {
      throw new BadRequestException('El periodo esta cerrado: no se puede modificar el plan de evaluacion');
    }
    await this.assertWeightFits(dto.group, dto.weight);
    return this.model.create(dto);
  }

  async findAll(query: EvaluationsQueryDto): Promise<Paginated<Evaluation>> {
    const filter: FilterQuery<EvaluationDocument> = query.group ? { group: query.group } : {};
    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ group: 1, createdAt: 1, _id: 1 }).skip(query.skip).limit(query.limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return paginate(data, total, query);
  }

  async findOne(id: string): Promise<EvaluationDocument> {
    const evaluation = await this.model.findById(id).exec();
    if (!evaluation) throw new NotFoundException('Evaluacion no encontrada');
    return evaluation;
  }

  async update(id: string, dto: UpdateEvaluationDto, user: AuthUser): Promise<EvaluationDocument> {
    const evaluation = await this.findOne(id);
    const group = await this.groupsService.assertCanManage(String(evaluation.group), user);
    const period = await this.periodsService.findOne(String(group.period));
    if (period.status === PeriodStatus.Closed) {
      throw new BadRequestException('El periodo esta cerrado: no se puede modificar el plan de evaluacion');
    }

    if (dto.weight !== undefined && dto.weight !== evaluation.weight) {
      if (await this.gradeModel.exists({ evaluation: evaluation._id })) {
        throw new ConflictException('No se puede cambiar el porcentaje: ya hay notas registradas');
      }
      await this.assertWeightFits(String(evaluation.group), dto.weight, id);
    }
    evaluation.set(dto);
    return evaluation.save();
  }

  // La suma de porcentajes del grupo nunca puede superar 100
  private async assertWeightFits(group: string, weight: number, excludeId?: string): Promise<void> {
    const others = await this.model.find({ group, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('weight').exec();
    const total = others.reduce((sum, e) => sum + e.weight, 0);
    if (total + weight > 100) {
      throw new BadRequestException(`La suma de porcentajes superaria 100 (el grupo ya tiene ${total}%)`);
    }
  }
}
