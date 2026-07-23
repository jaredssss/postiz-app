import { Body, Controller, Post } from '@nestjs/common';

@Controller('video')
export class VideoAiController {
  @Post('generate')
  generate(@Body() body: any) {
    return {
      status: 'queued',
      message: 'AI video generation pipeline created',
      campaign: body,
      next: ['script', 'voice', 'render', 'schedule'],
    };
  }

  @Post('schedule')
  schedule(@Body() body: any) {
    return {
      status: 'scheduled',
      message: 'Video scheduling pipeline ready',
      schedule: body,
    };
  }

  @Post('campaign/create')
  createCampaign(@Body() body: any) {
    return {
      status: 'created',
      campaign: body,
      workflow: 'AI -> Video -> Postiz -> Social Platforms',
    };
  }
}
