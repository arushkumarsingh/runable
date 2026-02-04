import type { ModelMessage } from "ai";
import {
  createSession as dbCreateSession,
  getSession as dbGetSession,
  appendMessage,
  getAllMessages,
  setSummary,
  deleteMessagesBeforeId,
  getTotalTokenCount,
} from "../db/client.js";
import { compactConversation } from "./compactor.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { shouldCompact } from "./tokenCounter.js";

/**
 * Session orchestrator - ties DB + compactor together
 * This is the clean interface for managing conversation state
 */

export interface SessionState {
  id: string;
  summary?: string;
  totalTokens: number;
}

export class Session {
  private sessionId: string;
  private summary: string | null = null;
  private totalTokens: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Load an existing session or create a new one
   */
  static async loadOrCreate(sessionId?: string): Promise<Session> {
    if (sessionId) {
      const existing = dbGetSession(sessionId);
      if (existing) {
        const session = new Session(sessionId);
        session.summary = existing.summary_text;
        session.totalTokens = getTotalTokenCount(sessionId);
        
        logger.info({
          sessionId,
          totalTokens: session.totalTokens,
          hasSummary: !!session.summary,
        }, "Loaded existing session");
        
        return session;
      }
    }

    // Create new session
    const newSession = dbCreateSession({ createdAt: new Date().toISOString() });
    const session = new Session(newSession.id);
    
    logger.info({ sessionId: session.sessionId }, "Created new session");
    
    return session;
  }

  /**
   * Get session ID
   */
  getId(): string {
    return this.sessionId;
  }

  /**
   * Get session state
   */
  getState(): SessionState {
    return {
      id: this.sessionId,
      summary: this.summary ?? undefined,
      totalTokens: this.totalTokens,
    };
  }

  /**
   * Build prompt context for the model
   * Returns: system message (if any) + summary + recent messages
   */
  buildPromptContext(systemPrompt?: string): ModelMessage[] {
    const messages: ModelMessage[] = [];

    // Add system message if provided
    if (systemPrompt) {
      messages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // Add summary as a system message if it exists
    if (this.summary) {
      messages.push({
        role: "system",
        content: `# Previous Conversation Summary\n\n${this.summary}`,
      });
    }

    // Add all recent messages from DB
    const dbMessages = getAllMessages(this.sessionId);
    for (const msg of dbMessages) {
      messages.push({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      });
    }

    logger.debug({
      sessionId: this.sessionId,
      messageCount: messages.length,
      hasSummary: !!this.summary,
    }, "Built prompt context");

    return messages;
  }

  /**
   * Add a user message to the session
   */
  addUserMessage(content: string, tokenCount?: number): void {
    appendMessage(this.sessionId, "user", content, tokenCount);
    if (tokenCount) {
      this.totalTokens += tokenCount;
    }
    logger.debug({ sessionId: this.sessionId, tokenCount }, "Added user message");
  }

  /**
   * Add an assistant message to the session
   */
  addAssistantMessage(content: string, tokenCount?: number): void {
    appendMessage(this.sessionId, "assistant", content, tokenCount);
    if (tokenCount) {
      this.totalTokens += tokenCount;
    }
    logger.debug({ sessionId: this.sessionId, tokenCount }, "Added assistant message");
  }

  /**
   * Add a system message to the session
   */
  addSystemMessage(content: string, tokenCount?: number): void {
    appendMessage(this.sessionId, "system", content, tokenCount);
    if (tokenCount) {
      this.totalTokens += tokenCount;
    }
    logger.debug({ sessionId: this.sessionId, tokenCount }, "Added system message");
  }

  /**
   * Update token count after a generation
   */
  updateTokenCount(inputTokens: number, outputTokens: number): void {
    this.totalTokens += inputTokens + outputTokens;
    logger.debug({
      sessionId: this.sessionId,
      inputTokens,
      outputTokens,
      totalTokens: this.totalTokens,
    }, "Updated token count");
  }

  /**
   * Check if compaction is needed and perform it
   * Returns true if compaction was performed
   */
  async checkAndCompact(): Promise<boolean> {
    if (!shouldCompact(this.totalTokens, config.compactAtTokens)) {
      return false;
    }

    logger.info({
      sessionId: this.sessionId,
      totalTokens: this.totalTokens,
      threshold: config.compactAtTokens,
    }, "Starting compaction");

    // Get all messages for compaction
    const dbMessages = getAllMessages(this.sessionId);
    const messages: ModelMessage[] = dbMessages.map(msg => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    // Compact the conversation
    const result = await compactConversation({
      existingSummary: this.summary ?? undefined,
      messages,
    });

    // Update summary in DB
    setSummary(this.sessionId, result.newSummary);
    this.summary = result.newSummary;

    // Delete old messages (keep recent ones)
    if (result.keepMessagesFromIndex > 0 && result.keepMessagesFromIndex < dbMessages.length) {
      const firstMessageToKeep = dbMessages[result.keepMessagesFromIndex];
      deleteMessagesBeforeId(this.sessionId, firstMessageToKeep.id);
    } else if (result.keepMessagesFromIndex >= dbMessages.length) {
      // All messages were compacted, delete all messages
      logger.info({ sessionId: this.sessionId }, "All messages compacted, clearing message history");
      // Delete all messages by using the last message ID + 1 (or delete all)
      if (dbMessages.length > 0) {
        const lastMessage = dbMessages[dbMessages.length - 1];
        deleteMessagesBeforeId(this.sessionId, lastMessage.id + 1);
      }
    }

    // Recalculate token count
    // After compaction, we have: summary tokens + recent message tokens
    // For simplicity, estimate summary tokens
    const summaryTokens = Math.ceil(result.newSummary.length / 4);
    const recentMessagesTokens = getTotalTokenCount(this.sessionId);
    this.totalTokens = summaryTokens + recentMessagesTokens;

    logger.info({
      sessionId: this.sessionId,
      compactedMessages: result.compactedMessageCount,
      newTokenCount: this.totalTokens,
      summaryLength: result.newSummary.length,
    }, "Compaction completed");

    return true;
  }

  /**
   * Get all messages in the session
   */
  getAllMessages(): ModelMessage[] {
    const dbMessages = getAllMessages(this.sessionId);
    return dbMessages.map(msg => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));
  }
}
