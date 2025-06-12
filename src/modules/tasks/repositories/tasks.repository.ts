import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { Task, TaskStatus } from '../entities/task.entity';
import { Prisma } from '@prisma/client';

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
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return this.prisma.task.create({
      data,
      include: {
        project: true,
        assignee: true,
        subtasks: true,
        parent: true,
      },
    });
  }

  async findAll(options: FindAllOptions): Promise<{ tasks: Task[]; total: number }> {
    const {
      userId,
      companyId,
      projectId,
      status,
      search,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
      sortBy = 'priority',
      sortOrder = 'desc',
    } = options;

    const where: Prisma.TaskWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (userId) where.assigneeId = userId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (startDate || endDate) {
      where.dueDate = {} as any;
      if (startDate) (where.dueDate as any).gte = startDate;
      if (endDate) (where.dueDate as any).lte = endDate;
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          project: true,
          assignee: true,
          subtasks: {
            where: { deletedAt: null },
          },
          parent: true,
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return { tasks, total };
  }

  async findById(id: string): Promise<Task | null> {
    return this.prisma.task.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: true,
        assignee: true,
        subtasks: {
          where: { deletedAt: null },
        },
        parent: true,
        timeEntries: {
          orderBy: { startTime: 'desc' },
          take: 10,
        },
      },
    });
  }

  async findByProjectId(projectId: string): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      include: {
        assignee: true,
        subtasks: true,
      },
    });
  }

  async findSubtasks(parentId: string): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        parentId,
        deletedAt: null,
      },
      include: {
        assignee: true,
        subtasks: true,
      },
      orderBy: { priority: 'desc' },
    });
  }

  async update(id: string, data: Prisma.TaskUpdateInput): Promise<Task> {
    return this.prisma.task.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        project: true,
        assignee: true,
        subtasks: true,
        parent: true,
      },
    });
  }

  async bulkUpdate(ids: string[], data: Prisma.TaskUpdateInput): Promise<number> {
    const result = await this.prisma.task.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    return result.count;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async archiveByProjectId(projectId: string): Promise<void> {
    await this.prisma.task.updateMany({
      where: {
        projectId,
        deletedAt: null,
      },
      data: {
        status: TaskStatus.DONE,
        archivedAt: new Date(),
      },
    });
  }

  async searchTasks(
    companyId: string,
    query: string,
    limit = 10
  ): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
        ],
      },
      take: limit,
      orderBy: [
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
      include: {
        project: true,
        assignee: true,
      },
    });
  }
}
