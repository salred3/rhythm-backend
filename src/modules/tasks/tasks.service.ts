import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TasksRepository } from './repositories/tasks.repository';
import { MatrixService } from './matrix.service';
import { Task, TaskStatus } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { addDays, isAfter, isBefore } from 'date-fns';

interface CreateTaskData extends CreateTaskDto {
  userId: string;
  companyId: string;
}

interface FindAllOptions {
  userId?: string;
  companyId: string;
  projectId?: string;
  status?: TaskStatus;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly matrixService: MatrixService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(data: CreateTaskData): Promise<Task> {
    // Apply smart defaults
    const taskData = {
      ...data,
      status: data.status || TaskStatus.TODO,
      matrixValues: {
        impact: data.matrixValues?.impact || 3,
        effort: data.matrixValues?.effort || 3,
        timelineDays: data.matrixValues?.timelineDays || 7,
        isLocked: false,
      },
    };

    // Validate due date
    if (data.dueDate && isBefore(new Date(data.dueDate), new Date())) {
      throw new ForbiddenException('Due date cannot be in the past');
    }

    // Calculate initial priority
    const priority = await this.matrixService.calculatePriority(
      taskData.matrixValues,
      data.companyId,
    );

    // Create task with calculated priority
    const task = await this.tasksRepository.create({
      ...taskData,
      priority,
      estimatedTimeMinutes: this.calculateEstimatedTime(taskData.matrixValues),
    });

    // Emit event for analytics
    this.eventEmitter.emit('task.created', { task });

    return task;
  }

  async findAll(options: FindAllOptions): Promise<{ tasks: Task[]; total: number }> {
    return this.tasksRepository.findAll(options);
  }

  async findOne(id: string, companyId: string): Promise<Task> {
    const task = await this.tasksRepository.findById(id);
    
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.companyId !== companyId) {
      throw new ForbiddenException('Access denied to this task');
    }

    return task;
  }

  async update(id: string, companyId: string, updateData: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(id, companyId);

    // Validate status transitions
    if (updateData.status) {
      this.validateStatusTransition(task.status, updateData.status);
    }

    // Validate due date changes
    if (updateData.dueDate) {
      if (isBefore(new Date(updateData.dueDate), new Date())) {
        throw new ForbiddenException('Due date cannot be in the past');
      }
    }

    // Recalculate priority if matrix values changed
    let newPriority = task.priority;
    if (updateData.matrixValues) {
      const mergedMatrixValues = {
        ...task.matrixValues,
        ...updateData.matrixValues,
      };
      newPriority = await this.matrixService.calculatePriority(
        mergedMatrixValues,
        companyId,
      );
    }

    const updatedTask = await this.tasksRepository.update(id, {
      ...updateData,
      priority: newPriority,
    });

    // Emit event for analytics
    this.eventEmitter.emit('task.updated', { 
      oldTask: task, 
      newTask: updatedTask 
    });

    return updatedTask;
  }

  async remove(id: string, companyId: string): Promise<void> {
    const task = await this.findOne(id, companyId);
    
    // Check for subtasks
    const subtasks = await this.tasksRepository.findSubtasks(id);
    if (subtasks.length > 0) {
      throw new ForbiddenException('Cannot delete task with subtasks');
    }

    await this.tasksRepository.delete(id);
    
    // Emit event
    this.eventEmitter.emit('task.deleted', { task });
  }

  private validateStatusTransition(currentStatus: TaskStatus, newStatus: TaskStatus): void {
    const validTransitions = {
      [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.TODO, TaskStatus.DONE, TaskStatus.BLOCKED],
      [TaskStatus.DONE]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
      [TaskStatus.BLOCKED]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new ForbiddenException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  private calculateEstimatedTime(matrixValues: any): number {
    // Simple estimation based on effort and timeline
    const baseMinutes = matrixValues.effort * 30; // 30 min per effort point
    const urgencyMultiplier = matrixValues.timelineDays < 7 ? 1.5 : 1;
    return Math.round(baseMinutes * urgencyMultiplier);
  }
}
