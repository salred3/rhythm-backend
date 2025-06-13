import { 
  IsString, 
  IsNotEmpty, 
  IsOptional, 
  IsDateString, 
  IsNumber, 
  Min, 
  Max,
  IsBoolean,
  IsEnum 
} from 'class-validator';

export class TimeEntryDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(86400) // Max 24 hours in seconds
  duration?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isManual?: boolean;
}

export class UpdateTimeEntryDto {
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(86400) // Max 24 hours in seconds
  duration?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ListTimeEntriesDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TimeEntryStatsDto {
  @IsOptional()
  @IsEnum(['day', 'week', 'month', 'year'])
  period?: 'day' | 'week' | 'month' | 'year';

  @IsOptional()
  @IsEnum(['day', 'week', 'task', 'project'])
  groupBy?: 'day' | 'week' | 'task' | 'project';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ExportTimeEntriesDto {
  @IsOptional()
  @IsEnum(['csv', 'pdf', 'excel'])
  format?: 'csv' | 'pdf' | 'excel';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsBoolean()
  includeDescription?: boolean;

  @IsOptional()
  @IsBoolean()
  groupByProject?: boolean;
}

export class BulkTimeEntryDto {
  @IsNotEmpty()
  entries: TimeEntryDto[];
}

/**
 * Response DTOs
 */
export class TimeEntryResponseDto {
  id: string;
  taskId: string;
  userId: string;
  companyId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  description?: string;
  isManual: boolean;
  createdAt: Date;
  updatedAt: Date;
  task?: {
    id: string;
    title: string;
    project?: {
      id: string;
      name: string;
      color: string;
    };
  };
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export class TimeEntryStatsResponseDto {
  period: {
    start: Date;
    end: Date;
  };
  groupedData: Array<{
    date?: Date;
    week?: string;
    taskId?: string;
    taskTitle?: string;
    projectId?: string;
    projectName?: string;
    duration: number;
    count: number;
  }>;
  insights: {
    averageSessionLength: number;
    mostProductiveTimeOfDay: string;
    longestSession: {
      duration: number;
      taskId: string;
      taskTitle: string;
      date: Date;
    };
    focusScore: number;
    consistencyScore: number;
    velocityTrend: number;
  };
  summary: {
    totalTime: number;
    totalEntries: number;
    averageSessionLength: number;
    mostProductiveTime: string;
    longestSession: number;
  };
}

export class TimerStateResponseDto {
  id: string;
  taskId: string;
  userId: string;
  companyId: string;
  startTime: Date;
  pausedAt?: Date;
  totalPausedDuration: number;
  isActive: boolean;
  isPaused: boolean;
  currentDuration?: number;
  task?: {
    id: string;
    title: string;
    project?: {
      id: string;
      name: string;
    };
  };
}
