import { generateText } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { ModelMessage } from "ai";

/**
 * Context compactor
 * Compresses old conversation history into structured summaries
 */

// Initialize the gateway provider with API key
const gateway = createGateway({
  apiKey: config.apiKey,
});

const model = gateway(config.model);

// Number of recent messages to keep verbatim
const KEEP_RECENT_MESSAGES = config.keepRecentMessages;

// Max length for summary to prevent infinite growth
const MAX_SUMMARY_LENGTH = config.maxSummaryLength;

interface CompactionInput {
  existingSummary?: string;
  messages: ModelMessage[];
}

interface CompactionResult {
  newSummary: string;
  keepMessagesFromIndex: number;
  compactedMessageCount: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

/**
 * Compact conversation history into structured memory
 * Keeps last N messages verbatim, summarizes everything before
 */
export async function compactConversation(input: CompactionInput): Promise<CompactionResult> {
  const { existingSummary, messages } = input;

  // If we have fewer messages than the keep threshold, no compaction needed
  if (messages.length <= KEEP_RECENT_MESSAGES) {
    logger.info("Not enough messages to compact");
    return {
      newSummary: existingSummary || "",
      keepMessagesFromIndex: 0,
      compactedMessageCount: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  // Split messages: compact older ones, keep recent ones
  const keepMessagesFromIndex = messages.length - KEEP_RECENT_MESSAGES;
  const messagesToCompact = messages.slice(0, keepMessagesFromIndex);
  const recentMessages = messages.slice(keepMessagesFromIndex);

  logger.info({
    totalMessages: messages.length,
    toCompact: messagesToCompact.length,
    toKeep: recentMessages.length,
    hasExistingSummary: !!existingSummary,
  }, "Starting compaction");

  // Build compaction prompt
  const compactionPrompt = buildCompactionPrompt(existingSummary, messagesToCompact);

  try {
    const result = await generateText({
      model,
      prompt: compactionPrompt,
      maxOutputTokens: 4000, // Limit summary length
    });

    let newSummary = result.text.trim();

    // Cap summary length to prevent infinite growth
    if (newSummary.length > MAX_SUMMARY_LENGTH) {
      logger.warn({ originalLength: newSummary.length }, "Summary too long, truncating");
      newSummary = newSummary.substring(0, MAX_SUMMARY_LENGTH) + "\n\n[Summary truncated due to length]";
    }

    const usage = {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    };

    logger.info({
      compactedMessages: messagesToCompact.length,
      summaryLength: newSummary.length,
      usage,
    }, "Compaction completed");

    return {
      newSummary,
      keepMessagesFromIndex,
      compactedMessageCount: messagesToCompact.length,
      usage,
    };
  } catch (error) {
    logger.error({ error }, "Compaction failed");
    throw error;
  }
}

/**
 * Build the compaction prompt with structured template
 */
function buildCompactionPrompt(existingSummary: string | undefined, messages: ModelMessage[]): string {
  const hasExistingSummary = existingSummary && existingSummary.trim().length > 0;

  let prompt = `You are compacting a conversation history to save context space. `;
  
  if (hasExistingSummary) {
    prompt += `There is an existing summary from previous compactions, and new messages that need to be merged into it.\n\n`;
    prompt += `## Existing Summary\n\n${existingSummary}\n\n`;
  } else {
    prompt += `This is the first compaction.\n\n`;
  }

  prompt += `## Messages to Compact\n\n`;
  prompt += formatMessagesForCompaction(messages);

  prompt += `\n\n## Task

Create a NEW summary that ${hasExistingSummary ? 'MERGES the existing summary with the new messages' : 'summarizes all the messages'}. Use this EXACT structure:

# Goal
[What is the user trying to achieve? What is the main objective or task?]

# Current Plan
[What steps or approach have been planned or are being followed?]

# Key Decisions
[Important choices made, approaches selected, rejected alternatives]

# Facts / Constraints
[Technical details, requirements, limitations, environment info]

# Tool Results
[Important outputs from tool calls, file operations, command results]

# Open Questions
[Unresolved issues, pending decisions, things that need clarification]

---

IMPORTANT RULES:
1. Keep it concise but preserve critical information
2. Focus on technical facts, not conversational fluff
3. ${hasExistingSummary ? 'MERGE information from existing summary with new messages - do not duplicate' : 'Extract key information from messages'}
4. If a section is empty or not applicable, write "None" or "N/A"
5. Use bullet points for readability
6. Maximum length: keep the summary under 2000 words

Generate the summary now:`;

  return prompt;
}

/**
 * Format messages into a readable text format for compaction
 */
function formatMessagesForCompaction(messages: ModelMessage[]): string {
  return messages
    .map((msg, index) => {
      const role = msg.role.toUpperCase();
      let content = "";

      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Handle multi-part content - simplified to avoid type issues
        content = msg.content
          .map(part => {
            if (part.type === "text") {
              return part.text;
            } else if (part.type === "tool-call") {
              return `[Tool Call: ${part.toolName}(...)]`;
            } else if (part.type === "tool-result") {
              return `[Tool Result from ${part.toolName}]`;
            } else if (part.type === "image") {
              return "[Image]";
            } else if (part.type === "file") {
              return "[File]";
            }
            return `[${part.type}]`;
          })
          .join("\n");
      }

      // Truncate very long messages
      if (content.length > 2000) {
        content = content.substring(0, 2000) + "...[truncated]";
      }

      return `[${index + 1}] ${role}: ${content}`;
    })
    .join("\n\n");
}