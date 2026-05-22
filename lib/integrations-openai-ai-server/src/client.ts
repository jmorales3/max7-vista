import OpenAI from "openai";

export const openai =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    ? new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      })
    : null;
