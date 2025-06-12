import { IsString, IsOptional, IsEnum, IsDateString, IsNumber, IsUUID, ValidateNested, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../entities/task.entity';

class MatrixValuesDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  impact: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  effort: number;

  @ApiProperty({ minimum: 1, maximum: 90 })
  @IsNumber()
  @Min(1)
  @Max(90)
  timelineDays: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;
}

export class CreateTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ type: MatrixValuesDto })
  @ValidateNested()
  @Type(() => MatrixValuesDto)
  matrixValues: MatrixValuesDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedTimeMinutes?: number;
}
