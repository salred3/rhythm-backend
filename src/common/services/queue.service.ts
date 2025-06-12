import Bull, { Queue, Job, JobOptions, ProcessorFunction } from 'bull';
import { EventEmitter } from 'events';

export interface QueueJob<T = any> {
  id: string;
  name: string;
  data: T;
  options?: JobOptions;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

/**
 * Queue service for background job processing using Bull
 */
export class QueueService extends EventEmitter {
  private queues: Map<string, Queue> = new Map();
  private redisUrl: string;

  constructor() {
    super();
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  }

  /**
   * Get or create a queue
   */
  getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Bull(queueName, this.redisUrl, {
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });

      // Set up event handlers
      this.setupQueueEvents(queue, queueName);
      
      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }

  /**
   * Add a job to a queue
   */
  async addJob<T = any>(
    queueName: string,
    data: T,
    options: JobOptions = {}
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return await queue.add(data, options);
  }

  /**
   * Add multiple jobs to a queue
   */
  async addBulkJobs<T = any>(
    queueName: string,
    jobs: Array<{ data: T; options?: JobOptions }>
  ): Promise<Job<T>[]> {
    const queue = this.getQueue(queueName);
    return await queue.addBulk(
      jobs.map(job => ({
        data: job.data,
        opts: job.options
      }))
    );
  }

  /**
   * Process jobs from a queue
   */
  processQueue<T = any>(
    queueName: string,
    processor: ProcessorFunction<T>,
    concurrency: number = 1
  ): void {
    const queue = this.getQueue(queueName);
    queue.process(concurrency, processor);
  }

  /**
   * Process named jobs from a queue
   */
  processNamedJob<T = any>(
    queueName: string,
    jobName: string,
    processor: ProcessorFunction<T>,
    concurrency: number = 1
  ): void {
    const queue = this.getQueue(queueName);
    queue.process(jobName, concurrency, processor);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats> {
    const queue = this.getQueue(queueName);
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed
    };
  }

  /**
   * Get jobs by status
   */
  async getJobs(
    queueName: string,
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed',
    start: number = 0,
    end: number = 100
  ): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    
    switch (status) {
      case 'waiting':
        return await queue.getWaiting(start, end);
      case 'active':
        return await queue.getActive(start, end);
      case 'completed':
        return await queue.getCompleted(start, end);
      case 'failed':
        return await queue.getFailed(start, end);
      case 'delayed':
        return await queue.getDelayed(start, end);
      default:
        return [];
    }
  }

  /**
   * Get a specific job
   */
  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  /**
   * Retry a failed job
   */
  async retryJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job && (await job.isFailed())) {
      await job.retry();
    }
  }

  /**
   * Remove a job
   */
  async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
    }
  }

  /**
   * Clean old jobs
   */
  async cleanQueue(
    queueName: string,
    grace: number = 0,
    status: 'completed' | 'failed' = 'completed',
    limit: number = 1000
  ): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    return await queue.clean(grace, status, limit);
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  /**
   * Empty a queue
   */
  async emptyQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.empty();
  }

  /**
   * Close a queue
   */
  async closeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.close();
      this.queues.delete(queueName);
    }
  }

  /**
   * Close all queues
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    this.queues.clear();
  }

  /**
   * Schedule a recurring job
   */
  async scheduleRecurringJob(
    queueName: string,
    jobName: string,
    data: any,
    cron: string,
    options: JobOptions = {}
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    
    // Remove existing job with same name
    await queue.removeRepeatable(jobName, {
      cron,
      ...options.repeat
    });
    
    // Add new recurring job
    await queue.add(
      jobName,
      data,
      {
        ...options,
        repeat: {
          cron,
          ...options.repeat
        }
      }
    );
  }

  /**
   * Get repeatable jobs
   */
  async getRepeatableJobs(queueName: string): Promise<any[]> {
    const queue = this.getQueue(queueName);
    return await queue.getRepeatableJobs();
  }

  /**
   * Remove a repeatable job
   */
  async removeRepeatableJob(
    queueName: string,
    jobName: string,
    repeatOptions: any
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.removeRepeatable(jobName, repeatOptions);
  }

  /**
   * Set up queue event handlers
   */
  private setupQueueEvents(queue: Queue, queueName: string): void {
    queue.on('completed', (job: Job, result: any) => {
      this.emit('job:completed', {
        queue: queueName,
        jobId: job.id,
        result
      });
    });

    queue.on('failed', (job: Job, err: Error) => {
      console.error(`Job ${job.id} in queue ${queueName} failed:`, err);
      this.emit('job:failed', {
        queue: queueName,
        jobId: job.id,
        error: err.message
      });
    });

    queue.on('active', (job: Job) => {
      this.emit('job:active', {
        queue: queueName,
        jobId: job.id
      });
    });

    queue.on('stalled', (job: Job) => {
      console.warn(`Job ${job.id} in queue ${queueName} stalled`);
      this.emit('job:stalled', {
        queue: queueName,
        jobId: job.id
      });
    });

    queue.on('error', (error: Error) => {
      console.error(`Queue ${queueName} error:`, error);
      this.emit('queue:error', {
        queue: queueName,
        error: error.message
      });
    });
  }

  /**
   * Common job processors
   */

  // Email sending processor
  static emailProcessor: ProcessorFunction = async (job: Job) => {
    const { to, subject, html, text } = job.data;
    
    // This would use the actual email sending logic
    console.log(`Sending email to ${to} with subject: ${subject}`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { sent: true, to, subject };
  };

  // Notification processor
  static notificationProcessor: ProcessorFunction = async (job: Job) => {
    const { userId, type, message } = job.data;
    
    console.log(`Sending ${type} notification to user ${userId}: ${message}`);
    
    // Simulate notification sending
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { sent: true, userId, type };
  };

  // Activity log processor
  static activityLogProcessor: ProcessorFunction = async (job: Job) => {
    const { companyId, userId, action, metadata } = job.data;
    
    console.log(`Logging activity: ${action} for user ${userId} in company ${companyId}`);
    
    // This would write to the database
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return { logged: true, action };
  };
}

