import { z } from "zod";
import { logger } from "../utils/logger.js";
import { mkdirSync } from "fs";

const envSchema = z.object({
  VERCEL_GATEWAY_KEY: z.string().min(1, "VERCEL_GATEWAY_KEY is required"),
  DB_PATH: z.string().default("./runable.sqlite"),
  MODEL: z.string().default("anthropic/claude-sonnet-4.5"),
  MAX_TOKENS: z.coerce.number().default(200_000),
  MAX_SUMMARY_LENGTH: z.coerce.number().default(8000),
  KEEP_RECENT_MESSAGES: z.coerce.number().default(20),
  COMPACT_AT_PERCENT: z.coerce.number().min(0).max(100).default(75),
  DOCKER_IMAGE: z.string().default("node:20-alpine"),
  DOCKER_WORKDIR: z.string().default("/workspace"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

/**
 * Parse and validate environment variables
 * Throws detailed error if validation fails
 */
function loadEnv() {
  const rawEnv = {
    VERCEL_GATEWAY_KEY: process.env.VERCEL_GATEWAY_KEY,
    DB_PATH: process.env.DB_PATH,
    MODEL: process.env.MODEL,
    MAX_TOKENS: process.env.MAX_TOKENS,
    MAX_SUMMARY_LENGTH: process.env.MAX_SUMMARY_LENGTH,
    KEEP_RECENT_MESSAGES: process.env.KEEP_RECENT_MESSAGES,
    COMPACT_AT_PERCENT: process.env.COMPACT_AT_PERCENT,
    DOCKER_IMAGE: process.env.DOCKER_IMAGE,
    DOCKER_WORKDIR: process.env.DOCKER_WORKDIR,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    logger.error({ error: result.error.format() }, "Environment validation failed");
    process.exit(1);
  }

  return result.data;
}

const env = loadEnv();

export const config = {
  logLevel: env.LOG_LEVEL,
  apiKey: env.VERCEL_GATEWAY_KEY,
  model: env.MODEL,
  dbPath: env.DB_PATH,
  maxTokens: env.MAX_TOKENS,
  maxSummaryLength: env.MAX_SUMMARY_LENGTH,
  keepRecentMessages: env.KEEP_RECENT_MESSAGES,
  compactAtTokens: Math.floor(env.MAX_TOKENS * (env.COMPACT_AT_PERCENT / 100)),
  compactAtPercent: env.COMPACT_AT_PERCENT,

  // Docker
  docker: {
    image: env.DOCKER_IMAGE,
    workdir: env.DOCKER_WORKDIR,
  },
} as const;

// Ensure workspace directory exists (process.cwd() is mounted to Docker workdir)
mkdirSync(process.cwd(), { recursive: true });

// Type export for the config object
export type Config = typeof config;

// Log configuration on load (without sensitive data)
logger.info({
  model: config.model,
  database: config.dbPath,
  maxTokens: config.maxTokens,
  compactAt: `${config.compactAtTokens} (${config.compactAtPercent}%)`,
  dockerImage: config.docker.image,
}, "Configuration loaded");
