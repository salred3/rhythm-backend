import { IsEnum, IsOptional, IsBoolean, ValidateNested, IsArray, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { DateRangeDto, MetricType } from './analytics-query.dto';

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
  PDF = 'pdf',
  EXCEL = 'excel'
}

export class ExportOptionsDto {
  @IsEnum(ExportFormat)
  format: ExportFormat;

  @ValidateNested()
  @Type(() => DateRangeDto)
  dateRange: DateRangeDto;

  @IsOptional()
  @IsBoolean()
  includeProductivity?: boolean = true;

  @IsOptional()
  @IsBoolean()
  includeEstimation?: boolean = true;

  @IsOptional()
  @IsBoolean()
  includePatterns?: boolean = true;

  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean = false;

  @IsOptional()
  @IsArray()
  @IsEnum(MetricType, { each: true })
  metrics?: MetricType[];

  @IsOptional()
  @IsBoolean()
  includeRawData?: boolean = false;

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';

  @IsOptional()
  @IsBoolean()
  anonymize?: boolean = false;
}
