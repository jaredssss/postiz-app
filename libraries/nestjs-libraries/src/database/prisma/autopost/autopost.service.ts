import { Injectable } from '@nestjs/common';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { AutopostDto } from '@gitroom/nestjs-libraries/dtos/autopost/autopost.dto';
import dayjs from 'dayjs';
import { END, START, StateGraph } from '@langchain/langgraph';
import { AutoPost, Integration } from '@prisma/client';
import { BaseMessage } from '@langchain/core/messages';
import striptags from 'striptags';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import Parser from 'rss-parser';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import {
  createImageModel,
  createTextModel,
  isPaidAiBlocked,
} from '@gitroom/nestjs-libraries/openai/ai.config';
import {
  organizationId,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
const parser = new Parser();

interface AutoPostVideoGenerationConfig {
  enabled: boolean;
  type: string;
  output: 'vertical' | 'horizontal';
}

interface AutoPostConfig {
  integrations: { id: string }[];
  videoGeneration: AutoPostVideoGenerationConfig | null;
}

interface WorkflowChannelsState {
  messages: BaseMessage[];
  integrations: Integration[];
  body: AutoPost;
  description: string;
  image: string;
  video: string;
  videoGeneration: AutoPostVideoGenerationConfig | null;
  id: string;
  load: {
    date: string;
    url: string;
    description: string;
  };
}

const model = createTextModel();
const dalle = createImageModel();

const generateContent = z.object({
  socialMediaPostContent: z
    .string()
    .describe('Content for social media posts max 120 chars'),
});

const dallePrompt = z.object({
  generatedTextToBeSentToDallE: z
    .string()
    .describe('Generated prompt from description to be sent to DallE'),
});

@Injectable()
export class AutopostService {
  constructor(
    private _autopostsRepository: AutopostRepository,
    private _temporalService: TemporalService,
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _organizationService: OrganizationService
  ) {}

  async stopAll(org: string) {
    const getAll = (await this.getAutoposts(org)).filter((f) => f.active);
    for (const autopost of getAll) {
      await this.changeActive(org, autopost.id, false);
    }
  }

  getAutoposts(orgId: string) {
    return this._autopostsRepository.getAutoposts(orgId);
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string) {
    const data = await this._autopostsRepository.createAutopost(
      orgId,
      body,
      id
    );

    await this.processCron(body.active, orgId, data.id);

    return data;
  }

  async changeActive(orgId: string, id: string, active: boolean) {
    const data = await this._autopostsRepository.changeActive(
      orgId,
      id,
      active
    );
    await this.processCron(active, orgId, id);
    return data;
  }

  async processCron(active: boolean, orgId: string, id: string) {
    if (active) {
      try {
        return this._temporalService.client
          .getRawClient()
          ?.workflow.start('autoPostWorkflow', {
            workflowId: `autopost-${id}`,
            taskQueue: 'main',
            args: [{ id, immediately: true }],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: organizationId,
                value: orgId,
              },
            ]),
          });
      } catch (err) {}
    }

    try {
      return await this._temporalService.terminateWorkflow(`autopost-${id}`);
    } catch (err) {
      return false;
    }
  }

  async deleteAutopost(orgId: string, id: string) {
    const data = await this._autopostsRepository.deleteAutopost(orgId, id);
    await this.processCron(false, orgId, id);
    return data;
  }

  async loadXML(url: string) {
    try {
      const { items } = await parser.parseURL(url);
      const findLast = items.reduce(
        (all: any, current: any) => {
          if (dayjs(current.pubDate).isAfter(all.pubDate)) {
            return current;
          }
          return all;
        },
        { pubDate: dayjs().subtract(100, 'years') }
      );

      return {
        success: true,
        date: findLast.pubDate,
        url: findLast.link,
        description: striptags(
          findLast?.['content:encoded'] ||
            findLast?.content ||
            findLast?.description ||
            ''
        )
          .replace(/\n/g, ' ')
          .trim(),
      };
    } catch (err) {
      /** sent **/
    }

    return { success: false };
  }

  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: () => [],
        },
        body: null,
        description: null,
        load: null,
        image: null,
        video: null,
        videoGeneration: null,
        integrations: null,
        id: null,
      },
    });

  async loadUrl(url: string) {
    try {
      const loadDom = new JSDOM(await (await fetch(url)).text());
      loadDom.window.document
        .querySelectorAll('script')
        .forEach((s) => s.remove());
      loadDom.window.document
        .querySelectorAll('style')
        .forEach((s) => s.remove());
      // remove all html, script and styles
      return striptags(loadDom.window.document.body.innerHTML);
    } catch (err) {
      return '';
    }
  }

  private parseAutopostConfig(rawIntegrations: string): AutoPostConfig {
    try {
      const parsed = JSON.parse(rawIntegrations || '[]');
      if (Array.isArray(parsed)) {
        return {
          integrations: parsed,
          videoGeneration: null,
        };
      }

      return {
        integrations: Array.isArray(parsed.integrations)
          ? parsed.integrations
          : [],
        videoGeneration: parsed.videoGeneration?.enabled
          ? {
              enabled: true,
              type: parsed.videoGeneration?.type || 'veo3',
              output: parsed.videoGeneration?.output || 'vertical',
            }
          : null,
      };
    } catch (err) {
      return {
        integrations: [],
        videoGeneration: null,
      };
    }
  }

  private async passGuardrails(orgId: string) {
    const maxPerDay = Number(process.env.AUTOPOST_MAX_POSTS_PER_DAY || '48');
    const quietHours = (process.env.AUTOPOST_QUIET_HOURS_UTC || '').trim();

    if (maxPerDay > 0) {
      const count = await this._postsService.countPostsFromDay(
        orgId,
        dayjs().startOf('day').toDate()
      );
      if (count >= maxPerDay) {
        return false;
      }
    }

    if (quietHours) {
      const parts = quietHours.split('-').map((p) => +p.trim());
      if (
        parts.length === 2 &&
        Number.isInteger(parts[0]) &&
        Number.isInteger(parts[1])
      ) {
        const hour = new Date().getUTCHours();
        const [start, end] = parts;
        if (start <= end) {
          if (hour >= start && hour < end) {
            return false;
          }
        } else if (hour >= start || hour < end) {
          return false;
        }
      }
    }

    return true;
  }

  async generateDescription(state: WorkflowChannelsState) {
    if (!state.body.generateContent) {
      return {
        ...state,
        description: state.body.content,
      };
    }

    const description =
      state.load.description || (await this.loadUrl(state.load.url));
    if (!description) {
      return {
        ...state,
        description: '',
      };
    }

    const structuredOutput = model.withStructuredOutput(generateContent);
    const { socialMediaPostContent } = await ChatPromptTemplate.fromTemplate(
      `
        You are an assistant that gets raw 'description' of a content and generate a social media post content.
        Rules:
        - Maximum 100 chars
        - Try to make it a short as possible to fit any social media
        - Add line breaks between sentences (\\n) 
        - Don't add hashtags
        - Add emojis when needed
        
        'description':
        {content}
      `
    )
      .pipe(structuredOutput)
      .invoke({
        content: description,
      });

    return {
      ...state,
      description: socialMediaPostContent,
    };
  }

  async generatePicture(state: WorkflowChannelsState) {
    if (!dalle || isPaidAiBlocked()) {
      return { ...state };
    }

    const structuredOutput = model.withStructuredOutput(dallePrompt);
    const { generatedTextToBeSentToDallE } =
      await ChatPromptTemplate.fromTemplate(
        `
        You are an assistant that gets description and generate a prompt that will be sent to DallE to generate pictures.
        
        content:
        {content}
      `
      )
        .pipe(structuredOutput)
        .invoke({
          content: state.load.description || state.description,
        });

    const image = await dalle.invoke(generatedTextToBeSentToDallE);

    return { ...state, image };
  }

  async generateVideo(state: WorkflowChannelsState) {
    if (!state.videoGeneration?.enabled) {
      return { ...state };
    }

    const organization = await this._organizationService.getOrgById(
      state.integrations[0].organizationId
    );
    if (!organization) {
      return { ...state };
    }

    const customParams = {
      prompt: state.load.description || state.description,
      images: [],
    };

    const payload: VideoDto = {
      type: state.videoGeneration.type,
      output: state.videoGeneration.output,
      customParams,
    };

    const generated = await this._mediaService.generateVideo(
      organization,
      payload
    );

    return {
      ...state,
      video: generated.path,
    };
  }

  async schedulePost(state: WorkflowChannelsState) {
    const nextTime = await this._postsService.findFreeDateTime(
      state.integrations[0].organizationId
    );

    await this._postsService.createPost(state.integrations[0].organizationId, {
      date: nextTime + 'Z',
      order: makeId(10),
      shortLink: false,
      type: 'draft',
      tags: [],
      posts: state.integrations.map((i) => ({
        settings: {
          __type: i.providerIdentifier as any,
          title: '',
          tags: [],
          subreddit: [],
        },
        group: makeId(10),
        integration: { id: i.id },
        value: [
          {
            id: makeId(10),
            delay: 0,
            content:
              state.description.replace(/\n/g, '\n\n') +
              '\n\n' +
              state.load.url,
            image: !state.image && !state.video
              ? []
              : [
                  {
                    id: makeId(10),
                    name: makeId(10),
                    path: state.video || state.image,
                    organizationId: state.integrations[0].organizationId,
                  },
                ],
          },
        ],
      })),
    }, 'AUTOPOST');
  }

  async updateUrl(state: WorkflowChannelsState) {
    await this._autopostsRepository.updateUrl(state.id, state.load.url);
  }

  async startAutopost(id: string) {
    const getPost = await this._autopostsRepository.getAutopost(id);
    if (!getPost || !getPost.active) {
      return;
    }

    if (!(await this.passGuardrails(getPost.organizationId))) {
      return;
    }

    const load = await this.loadXML(getPost.url);
    if (!load.success || load.url === getPost.lastUrl) {
      return;
    }

    const integrations = await this._integrationService.getIntegrationsList(
      getPost.organizationId
    );

    const autoPostConfig = this.parseAutopostConfig(getPost.integrations || '');
    const parseIntegrations = autoPostConfig.integrations;
    const neededIntegrations = integrations.filter((i) =>
      parseIntegrations.some((ii: any) => ii.id === i.id)
    );

    const integrationsToSend =
      parseIntegrations.length === 0 ? integrations : neededIntegrations;
    if (integrationsToSend.length === 0) {
      return;
    }

    const state = AutopostService.state();
    const workflow = state
      .addNode('generate-description', this.generateDescription.bind(this))
      .addNode('generate-picture', this.generatePicture.bind(this))
      .addNode('generate-video', this.generateVideo.bind(this))
      .addNode('schedule-post', this.schedulePost.bind(this))
      .addNode('update-url', this.updateUrl.bind(this))
      .addEdge(START, 'generate-description')
      .addConditionalEdges(
        'generate-description',
        (state: WorkflowChannelsState) => {
          if (!state.description) {
            return 'schedule-post';
          }
          if (state.videoGeneration?.enabled) {
            return 'generate-video';
          }
          if (state.body.addPicture) {
            return 'generate-picture';
          }
          return 'schedule-post';
        }
      )
      .addEdge('generate-picture', 'schedule-post')
      .addEdge('generate-video', 'schedule-post')
      .addEdge('schedule-post', 'update-url')
      .addEdge('update-url', END);

    const app = workflow.compile();
    await app.invoke({
      messages: [],
      id,
      body: getPost,
      load,
      integrations: integrationsToSend,
      videoGeneration: autoPostConfig.videoGeneration,
    });
  }
}
