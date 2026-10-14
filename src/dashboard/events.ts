import { EventEmitter } from 'node:events';

export interface DashboardEvent {
  type: 'job_created' | 'job_updated' | 'checkpoint_created' | 'checkpoint_resolved' | 'message_logged';
  jobId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

class DashboardEventBus extends EventEmitter {
  emitJobEvent(type: DashboardEvent['type'], jobId: string, data: Record<string, unknown>): void {
    const event: DashboardEvent = {
      type,
      jobId,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emit('event', event);
    this.emit(`job:${jobId}`, event);
  }
}

export const eventBus = new DashboardEventBus();
