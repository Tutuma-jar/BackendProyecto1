import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { toBoolean } from '../../common/dto/query-helpers';
import { Day } from '../schemas/group.schema';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleSlotDto {
  @ApiProperty({ enum: Day, example: Day.Lunes })
  @IsEnum(Day)
  day!: Day;

  @ApiProperty({ example: '07:00', description: 'HH:mm (24 h)' })
  @Matches(TIME, { message: 'startTime debe tener formato HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '09:00', description: 'HH:mm (24 h)' })
  @Matches(TIME, { message: 'endTime debe tener formato HH:mm' })
  endTime!: string;

  @ApiProperty({ description: 'ID del salon (coleccion classrooms)' })
  @IsMongoId()
  classroom!: string;
}

export class CreateGroupDto {
  @ApiProperty({ description: 'ID de la materia' })
  @IsMongoId()
  subject!: string;

  @ApiProperty({ description: 'ID del docente' })
  @IsMongoId()
  teacher!: string;

  @ApiProperty({ description: 'ID del periodo' })
  @IsMongoId()
  period!: string;

  @ApiProperty({ minimum: 1, maximum: 100, example: 30 })
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;

  @ApiProperty({ type: [ScheduleSlotDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule!: ScheduleSlotDto[];
}

// La materia y el periodo no se pueden cambiar una vez creado el grupo
export class UpdateGroupDto extends PartialType(OmitType(CreateGroupDto, ['subject', 'period', 'schedule'] as const)) {
  @ApiPropertyOptional({ type: [ScheduleSlotDto] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedule?: ScheduleSlotDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class GroupsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por periodo' })
  @IsOptional()
  @IsMongoId()
  period?: string;

  @ApiPropertyOptional({ description: 'Filtrar por materia' })
  @IsOptional()
  @IsMongoId()
  subject?: string;

  @ApiPropertyOptional({ description: 'Filtrar por docente' })
  @IsOptional()
  @IsMongoId()
  teacher?: string;

  @ApiPropertyOptional({ description: 'true = activos, false = inactivos' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'true = solo grupos activos con cupos libres' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional({ enum: Day, description: 'Grupos que tienen clase ese dia' })
  @IsOptional()
  @IsEnum(Day)
  day?: Day;
}
