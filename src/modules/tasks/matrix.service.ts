import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TasksRepository } from './repositories/tasks.repository';
import { CompanyPreferencesService } from '../settings/company-preferences.service';
import { MatrixValuesDto } from './dto/matrix-values.dto';
import { Task } from './entities/task.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface MatrixWeights {
  impactWeight: number;
  effortWeight: number;
  timelineWeight: number;
}

interface PriorityDistribution {
  high: number;
  medium: number;
  low: number;
}

@Injectable()
export class MatrixService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly companyPreferences: CompanyPreferencesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async calculatePriority(
    matrixValues: MatrixValuesDto,
    companyId: string
  ): Promise<number> {
    // Get company-specific weights or use defaults
    const weights = await this.getCompanyWeights(companyId);
    
    // Calculate weighted score
    const impactScore = (matrixValues.impact / 5) * weights.impactWeight;
    const effortScore = ((6 - matrixValues.effort) / 5) * weights.effortWeight;
    const timelineScore = ((91 - matrixValues.timelineDays) / 90) * weights.timelineWeight;
    
    // Final priority score (0-100)
    const priority = Math.round(
      (impactScore + effortScore + timelineScore) / 
      (weights.impactWeight + weights.effortWeight + weights.timelineWeight) * 100
    );
    
    return Math.min(100, Math.max(0, priority));
  }

  async updateTaskMatrix(
    taskId: string,
    companyId: string,
    matrixValues: MatrixValuesDto
  ): Promise<Task> {
    const task = await this.tasksRepository.findById(taskId);
    
    if (!task || task.companyId !== companyId) {
      throw new NotFoundException('Task not found');
    }

    // Check if values are locked
    if (task.matrixValues.isLocked && !matrixValues.isLocked) {
      throw new ForbiddenException('Cannot update locked matrix values');
    }

    // Calculate new priority
    const priority = await this.calculatePriority(matrixValues, companyId);

    // Update task
    const updatedTask = await this.tasksRepository.update(taskId, {
      matrixValues,
      priority,
    });

    // Track matrix changes for analytics
    this.eventEmitter.emit('matrix.updated', {
      taskId,
      oldValues: task.matrixValues,
      newValues: matrixValues,
      oldPriority: task.priority,
      newPriority: priority,
    });

    return updatedTask;
  }

  async bulkRecalculate(companyId: string): Promise<void> {
    const tasks = await this.tasksRepository.findAll({ companyId });
    
    for (const task of tasks.tasks) {
      if (!task.matrixValues.isLocked) {
        const priority = await this.calculatePriority(task.matrixValues, companyId);
        await this.tasksRepository.update(task.id, { priority });
      }
    }
    
    this.eventEmitter.emit('matrix.bulk-recalculated', { companyId });
  }

  async getDistribution(companyId: string): Promise<PriorityDistribution> {
    const tasks = await this.tasksRepository.findAll({ companyId });
    
    const distribution = tasks.tasks.reduce((acc, task) => {
      if (task.priority >= 70) acc.high++;
      else if (task.priority >= 40) acc.medium++;
      else acc.low++;
      return acc;
    }, { high: 0, medium: 0, low: 0 });
    
    const total = tasks.total || 1;
    
    return {
      high: Math.round((distribution.high / total) * 100),
      medium: Math.round((distribution.medium / total) * 100),
      low: Math.round((distribution.low / total) * 100),
    };
  }

  async getHistoricalData(taskId: string, days = 30): Promise<any[]> {
    // This would query a separate matrix_history table
    // For now, return mock data structure
    return [
      {
        date: new Date(),
        impact: 5,
        effort: 3,
        timelineDays: 7,
        priority: 85,
      },
    ];
  }

  private async getCompanyWeights(companyId: string): Promise<MatrixWeights> {
    const preferences = await this.companyPreferences.getMatrixWeights(companyId);
    
    return preferences || {
      impactWeight: 40,
      effortWeight: 30,
      timelineWeight: 30,
    };
  }
}
