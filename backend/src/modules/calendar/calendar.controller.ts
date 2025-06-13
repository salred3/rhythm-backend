import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export class CalendarController {
  constructor(private fastify: FastifyInstance) {}

  async autoSchedule(request: FastifyRequest, reply: FastifyReply) {
    const userId = (request as any).user?.userId;
    const { companyId } = request.params as { companyId?: string };

    const jobId = await this.fastify.jobManager.scheduleUserTasks(userId, companyId);

    return reply.send({
      jobId,
      message: 'Auto-scheduling started',
    });
  }

  async getSchedulingStatus(request: FastifyRequest, reply: FastifyReply) {
    const { jobId } = request.params as { jobId: string };

    const status = await this.fastify.jobManager.getJobStatus('scheduler', jobId);

    return reply.send(status);
  }
}
