import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';
import { IsOptional, IsBoolean, IsEnum, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '../entities/task.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

class MatrixValuesDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  impact?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  effort?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  timelineDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['matrixValues'] as const)
) {
  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MatrixValuesDto)
  matrixValues?: Partial<MatrixValuesDto>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
