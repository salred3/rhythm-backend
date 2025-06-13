import { PrismaClient } from '@prisma/client';
import { TimeEntriesRepository } from './repositories/time-entries.repository';
import { parse } from 'csv-parse/sync';
import { PDFDocument, rgb } from 'pdf-lib';
import * as ExcelJS from 'exceljs';
import { Logger } from '../../common/logger/logger.service';

interface CreateEntryParams {
  taskId: string;
  userId: string;
  companyId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  description?: string;
}

interface UpdateEntryParams {
  id: string;
  userId: string;
  companyId: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  description?: string;
}

interface ListEntriesParams {
  userId: string;
  companyId: string;
  startDate?: Date;
  endDate?: Date;
  taskId?: string;
  projectId?: string;
  pagination: {
    page: number;
    limit: number;
  };
}

interface ExportParams {
  userId: string;
  companyId: string;
  format: 'csv' | 'pdf' | 'excel';
  startDate?: Date;
  endDate?: Date;
}

interface StatisticsParams {
  userId: string;
  companyId: string;
  period: 'day' | 'week' | 'month' | 'year';
  groupBy: 'day' | 'week' | 'task' | 'project';
}

export class TimeEntriesService {
  private prisma: PrismaClient;
  private repository: TimeEntriesRepository;
  private logger: Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.repository = new TimeEntriesRepository();
    this.logger = new Logger('TimeEntriesService');
  }

  /**
   * Create a new time entry
   */
  async createEntry(params: CreateEntryParams): Promise<any> {
    const { taskId, userId, companyId, startTime, endTime, duration, description } = params;

    // Validate no overlaps
    const hasOverlap = await this.checkOverlap({
      userId,
      startTime,
      endTime,
      excludeId: undefined,
    });

    if (hasOverlap) {
      throw new Error('Time entry overlaps with existing entries');
    }

    // Create the entry
    const timeEntry = await this.prisma.timeEntry.create({
      data: {
        taskId,
        userId,
        companyId,
        startTime,
        endTime,
        duration,
        description,
        isManual: false,
      },
      include: {
        task: {
          include: {
            project: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.info(`Time entry created: ${timeEntry.id}`);

    return timeEntry;
  }

  /**
   * Update an existing time entry
   */
  async updateEntry(params: UpdateEntryParams): Promise<any> {
    const { id, userId, companyId, ...updateData } = params;

    // Check ownership
    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: {
        id,
        userId,
        companyId,
      },
    });

    if (!existingEntry) {
      throw new Error('Time entry not found or access denied');
    }

    // If updating time range, check for overlaps
    if (updateData.startTime || updateData.endTime) {
      const startTime = updateData.startTime || existingEntry.startTime;
      const endTime = updateData.endTime || existingEntry.endTime;

      const hasOverlap = await this.checkOverlap({
        userId,
        startTime,
        endTime,
        excludeId: id,
      });

      if (hasOverlap) {
        throw new Error('Updated time range overlaps with existing entries');
      }

      // Recalculate duration if times changed
      updateData.duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    }

    // Update the entry
    const updatedEntry = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...updateData,
        isManual: true, // Mark as manually edited
      },
      include: {
        task: {
          include: {
            project: true,
          },
        },
      },
    });

    this.logger.info(`Time entry updated: ${id}`);

    return updatedEntry;
  }

  /**
   * Delete a time entry
   */
  async deleteEntry(params: { id: string; userId: string; companyId: string }): Promise<void> {
    const { id, userId, companyId } = params;

    // Check ownership
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id,
        userId,
        companyId,
      },
    });

    if (!entry) {
      throw new Error('Time entry not found or access denied');
    }

    // Update task time spent
    await this.prisma.task.update({
      where: { id: entry.taskId },
      data: {
        timeSpent: {
          decrement: entry.duration,
        },
      },
    });

    // Delete the entry
    await this.prisma.timeEntry.delete({
      where: { id },
    });

    this.logger.info(`Time entry deleted: ${id}`);
  }

  /**
   * List time entries with filtering and pagination
   */
  async listEntries(params: ListEntriesParams): Promise<any> {
    const { userId, companyId, startDate, endDate, taskId, projectId, pagination } = params;

    const where: any = {
      userId,
      companyId,
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = startDate;
      if (endDate) where.startTime.lte = endDate;
    }

    if (taskId) where.taskId = taskId;
    if (projectId) where.task = { projectId };

    const [entries, total] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where,
        include: {
          task: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
        },
        orderBy: { startTime: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      this.prisma.timeEntry.count({ where }),
    ]);

    return {
      data: entries,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * Get time tracking statistics
   */
  async getStatistics(params: StatisticsParams): Promise<any> {
    const { userId, companyId, period, groupBy } = params;

    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    // Get aggregated data from repository
    const stats = await this.repository.getAggregatedStats({
      userId,
      companyId,
      startDate,
      endDate,
      groupBy,
    });

    // Get additional insights
    const insights = await this.repository.getProductivityInsights({
      userId,
      companyId,
      startDate,
      endDate,
    });

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      groupedData: stats,
      insights,
      summary: {
        totalTime: stats.reduce((sum: number, item: any) => sum + item.duration, 0),
        totalEntries: stats.reduce((sum: number, item: any) => sum + item.count, 0),
        averageSessionLength: insights.averageSessionLength,
        mostProductiveTime: insights.mostProductiveTimeOfDay,
        longestSession: insights.longestSession,
      },
    };
  }

  /**
   * Export time entries in various formats
   */
  async exportEntries(params: ExportParams): Promise<any> {
    const { userId, companyId, format, startDate, endDate } = params;

    // Get all entries for export
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId,
        companyId,
        ...(startDate && { startTime: { gte: startDate } }),
        ...(endDate && { endTime: { lte: endDate } }),
      },
      include: {
        task: {
          include: {
            project: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    let exportData: Buffer;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'csv':
        exportData = await this.exportToCSV(entries);
        contentType = 'text/csv';
        filename = `time-entries-${Date.now()}.csv`;
        break;

      case 'pdf':
        exportData = await this.exportToPDF(entries);
        contentType = 'application/pdf';
        filename = `time-entries-${Date.now()}.pdf`;
        break;

      case 'excel':
        exportData = await this.exportToExcel(entries);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `time-entries-${Date.now()}.xlsx`;
        break;

      default:
        throw new Error('Unsupported export format');
    }

    return {
      data: exportData,
      contentType,
      filename,
    };
  }

  /**
   * Check for overlapping time entries
   */
  private async checkOverlap(params: {
    userId: string;
    startTime: Date;
    endTime: Date;
    excludeId?: string;
  }): Promise<boolean> {
    const { userId, startTime, endTime, excludeId } = params;

    const overlapping = await this.prisma.timeEntry.findFirst({
      where: {
        userId,
        id: excludeId ? { not: excludeId } : undefined,
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } },
            ],
          },
        ],
      },
    });

    return !!overlapping;
  }

  /**
   * Export entries to CSV format
   */
  private async exportToCSV(entries: any[]): Promise<Buffer> {
    const headers = [
      'Date',
      'Start Time',
      'End Time',
      'Duration (minutes)',
      'Project',
      'Task',
      'Description',
    ];

    const rows = entries.map(entry => [
      entry.startTime.toLocaleDateString(),
      entry.startTime.toLocaleTimeString(),
      entry.endTime.toLocaleTimeString(),
      Math.round(entry.duration / 60),
      entry.task.project?.name || '',
      entry.task.title,
      entry.description || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Export entries to PDF format
   */
  private async exportToPDF(entries: any[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();
    const { height } = page.getSize();
    let yPosition = height - 50;

    // Title
    page.drawText('Time Tracking Report', {
      x: 50,
      y: yPosition,
      size: 20,
      color: rgb(0, 0, 0),
    });

    yPosition -= 40;

    // Table headers
    const headers = ['Date', 'Time', 'Duration', 'Project', 'Task'];
    const columnWidths = [80, 100, 60, 100, 150];
    let xPosition = 50;

    headers.forEach((header, index) => {
      page.drawText(header, {
        x: xPosition,
        y: yPosition,
        size: 12,
        color: rgb(0, 0, 0),
      });
      xPosition += columnWidths[index];
    });

    yPosition -= 20;

    // Table rows
    for (const entry of entries) {
      if (yPosition < 50) {
        page = pdfDoc.addPage();
        yPosition = height - 50;
      }

      xPosition = 50;
      const row = [
        entry.startTime.toLocaleDateString(),
        `${entry.startTime.toLocaleTimeString()} - ${entry.endTime.toLocaleTimeString()}`,
        `${Math.round(entry.duration / 60)}m`,
        entry.task.project?.name || '-',
        entry.task.title,
      ];

      row.forEach((cell, index) => {
        page.drawText(cell.substring(0, 20), {
          x: xPosition,
          y: yPosition,
          size: 10,
          color: rgb(0, 0, 0),
        });
        xPosition += columnWidths[index];
      });

      yPosition -= 15;
    }

    // Summary
    yPosition -= 20;
    const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0) / 60;
    page.drawText(`Total Time: ${Math.round(totalMinutes)} minutes`, {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Export entries to Excel format
   */
  private async exportToExcel(entries: any[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Time Entries');

    // Add headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Start Time', key: 'startTime', width: 15 },
      { header: 'End Time', key: 'endTime', width: 15 },
      { header: 'Duration (min)', key: 'duration', width: 15 },
      { header: 'Project', key: 'project', width: 20 },
      { header: 'Task', key: 'task', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
    ];

    // Add rows
    entries.forEach(entry => {
      worksheet.addRow({
        date: entry.startTime.toLocaleDateString(),
        startTime: entry.startTime.toLocaleTimeString(),
        endTime: entry.endTime.toLocaleTimeString(),
        duration: Math.round(entry.duration / 60),
        project: entry.task.project?.name || '',
        task: entry.task.title,
        description: entry.description || '',
      });
    });

    // Add summary row
    worksheet.addRow({});
    worksheet.addRow({
      date: 'Total',
      duration: entries.reduce((sum, entry) => sum + Math.round(entry.duration / 60), 0),
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
