import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoScheduleService {
  async schedule(video: any) {
    return {
      status: 'queued',
      video,
      publisher: 'postiz',
    };
  }
}
