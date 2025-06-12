import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { TasksRepository } from './repositories/tasks.repository';
import { MatrixService } from './matrix.service';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class SubtasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly matrixService: MatrixService,
  ) {}

  async createSubtask(
    parentId: string,
    data: CreateTaskDto & { userId: string; companyId: string }
  ): Promise<Task> {
    // Verify parent exists and user has access
    const parent = await this.tasksRepository.findById(parentId);
    if (!parent || parent.companyId !== data.companyId) {
      throw new NotFoundException('Parent task not found');
    }

    // Check nesting depth (max 3 levels)
    const depth = await this.getTaskDepth(parentId);
    if (depth >= 3) {
      throw new ForbiddenException('Maximum nesting depth exceeded');
    }

    // Create subtask with inherited properties
    const subtask = await this.tasksRepository.create({
      ...data,
      parentId,
      projectId: parent.projectId,
      matrixValues: data.matrixValues || {
        impact: Math.max(1, parent.matrixValues.impact - 1),
        effort: Math.max(1, parent.matrixValues.effort - 1),
        timelineDays: Math.max(1, Math.floor(parent.matrixValues.timelineDays / 2)),
        isLocked: false,
      },
    });

    // Update parent progress
    await this.updateParentProgress(parentId);

    return subtask;
  }

  async getSubtasks(taskId: string, companyId: string): Promise<Task[]> {
    const task = await this.tasksRepository.findById(taskId);
    if (!task || task.companyId !== companyId) {
      throw new NotFoundException('Task not found');
    }

    return this.tasksRepository.findSubtasks(taskId);
  }

  async updateProgress(taskId: string): Promise<void> {
    const subtasks = await this.tasksRepository.findSubtasks(taskId);
    
    if (subtasks.length === 0) return;
    
    const completedSubtasks = subtasks.filter(t => t.status === 'DONE').length;
    const progress = Math.round((completedSubtasks / subtasks.length) * 100);
    
    await this.tasksRepository.update(taskId, { progress });
    
    // Cascade up to parent
    const task = await this.tasksRepository.findById(taskId);
    if (task.parentId) {
      await this.updateProgress(task.parentId);
    }
  }

  async bulkUpdate(
    parentId: string,
    companyId: string,
    updates: Partial<Task>
  ): Promise<number> {
    const parent = await this.tasksRepository.findById(parentId);
    if (!parent || parent.companyId !== companyId) {
      throw new NotFoundException('Parent task not found');
    }

    const subtasks = await this.tasksRepository.findSubtasks(parentId);
    const subtaskIds = subtasks.map(t => t.id);

    return this.tasksRepository.bulkUpdate(subtaskIds, updates);
  }

  async cascadeComplete(taskId: string, companyId: string): Promise<void> {
    const task = await this.tasksRepository.findById(taskId);
    if (!task || task.companyId !== companyId) {
      throw new NotFoundException('Task not found');
    }

    // Mark all subtasks as done
    const subtasks = await this.tasksRepository.findSubtasks(taskId);
    const subtaskIds = subtasks.map(t => t.id);
    
    await this.tasksRepository.bulkUpdate(subtaskIds, {
      status: 'DONE',
      completedAt: new Date(),
    });

    // Update parent progress
    if (task.parentId) {
      await this.updateParentProgress(task.parentId);
    }
  }

  private async getTaskDepth(taskId: string): Promise<number> {
    let depth = 0;
    let currentId = taskId;

    while (currentId && depth < 5) {
      const task = await this.tasksRepository.findById(currentId);
      if (!task || !task.parentId) break;
      currentId = task.parentId;
      depth++;
    }

    return depth;
  }

  private async updateParentProgress(parentId: string): Promise<void> {
    await this.updateProgress(parentId);
  }
}
