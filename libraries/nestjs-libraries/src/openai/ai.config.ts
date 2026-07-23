import { ChatOpenAI, DallEAPIWrapper } from '@langchain/openai';

const clean = (value?: string) => (value || '').trim();

const isTrue = (value?: string) => clean(value).toLowerCase() === 'true';

export const isPaidAiBlocked = () => isTrue(process.env.AI_FREE_TIER_ONLY);

const resolveApiKey = () =>
  clean(process.env.AI_TEXT_API_KEY) || clean(process.env.OPENAI_API_KEY);

const resolveBaseUrl = () => clean(process.env.AI_TEXT_BASE_URL) || undefined;

export const assertAiProviderReady = () => {
  if (!isPaidAiBlocked()) {
    return;
  }

  if (!clean(process.env.AI_TEXT_API_KEY)) {
    throw new Error(
      'AI_FREE_TIER_ONLY=true requires AI_TEXT_API_KEY to be configured'
    );
  }
};

export const createTextModel = () => {
  assertAiProviderReady();
  return new ChatOpenAI({
    apiKey: resolveApiKey() || 'missing-api-key',
    model: clean(process.env.AI_TEXT_MODEL) || 'gpt-4.1',
    configuration: {
      baseURL: resolveBaseUrl(),
    },
    temperature: 0.7,
  });
};

export const createImageModel = () => {
  if (isPaidAiBlocked()) {
    return null;
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    return null;
  }

  return new DallEAPIWrapper({
    apiKey,
    model: clean(process.env.AI_IMAGE_MODEL) || 'chatgpt-image-latest',
  });
};
