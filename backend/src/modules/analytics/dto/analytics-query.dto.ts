import { IsOptional, IsEnum, IsDateString, IsArray, IsString, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class DateRangeDto {
  @IsDateString()
  start: Date;

  @IsDateString()
  end: Date;
}

export enum GroupByOption {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year'
}

export enum MetricType {
  PRODUCTIVITY = 'productivity',
  ESTIMATION = 'estimation',
  TIME_TRACKING = 'time_tracking',
  COMPLETION = 'completion',
  VELOCITY = 'velocity'
}

export class AnalyticsQueryDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange?: DateRangeDto;

  @IsOptional()
  @IsEnum(GroupByOption)
  groupBy?: GroupByOption;

  @IsOptional()
  @IsArray()
  @IsEnum(MetricType, { each: true })
  metrics?: MetricType[];

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 100;

  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  taskTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  priorities?: string[];
}
