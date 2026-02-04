import type { LanguageModelUsage } from "ai";
import { logger } from "../utils/logger.js";

/**
 * Extract usage information from a generation result
 * Use this after any generateText or streamText call
 */
export function extractUsage(usage: LanguageModelUsage): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

/**
 * Calculate cumulative token count from multiple usage objects
 * Use this to track total tokens across a conversation
 */
export function sumUsage(usages: LanguageModelUsage[]): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const usage of usages) {
    inputTokens += usage.inputTokens ?? 0;
    outputTokens += usage.outputTokens ?? 0;
    totalTokens += usage.totalTokens ?? 0;
  }

  logger.debug({ inputTokens, outputTokens, totalTokens }, "Summed token usage");

  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Check if we should compact based on total token count
 * Takes the cumulative token count from the database/session
 */
export function shouldCompact(currentTokenCount: number, compactAtTokens: number): boolean {
  return currentTokenCount >= compactAtTokens;
}
