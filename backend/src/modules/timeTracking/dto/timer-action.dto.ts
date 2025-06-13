import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class TimerActionDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;
}

export class StartTimerDto extends TimerActionDto {
  @IsOptional()
  @IsString()
  description?: string;
}

export class StopTimerDto extends TimerActionDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  summary?: string;
}

export class PauseTimerDto extends TimerActionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SyncTimersDto {
  @IsNotEmpty()
  timers: TimerStateDto[];
}

export class TimerStateDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsDateString()
  startTime: string;

  @IsOptional()
  @IsDateString()
  pausedAt?: string;

  @IsNotEmpty()
  totalPausedDuration: number;

  @IsNotEmpty()
  isActive: boolean;

  @IsNotEmpty()
  isPaused: boolean;
}
