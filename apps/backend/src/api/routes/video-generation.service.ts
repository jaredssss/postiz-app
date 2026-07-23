import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoGenerationService {
  async createVideo(input: { topic: string; duration?: number }) {
    return {
      status: 'pending',
      topic: input.topic,
      pipeline: ['script-generation', 'voice-generation', 'render-mp4'],
    };
  }
}
