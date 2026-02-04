import "dotenv/config";
import { generateText } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { config } from "./src/config/env.js";
import { logger } from "./src/utils/logger.js";
import { initDB, runMigrations } from "./src/db/index.js";
import { getAllSessions } from "./src/db/client.js";
import { Session } from "./src/agent/session.js";
import { tools } from "./src/agent/tools.js";
import { extractUsage } from "./src/agent/tokenCounter.js";
import { ensureContainer } from "./src/docker/manager.js";
import * as readline from "readline/promises";
import inquirer from "inquirer";

/**
 * Main entry point for the context-compacting coding agent
 */

// Initialize the gateway provider
const gateway = createGateway({
  apiKey: config.apiKey,
});

const model = gateway(config.model);

// System prompt for the agent
const SYSTEM_PROMPT = `You are a helpful coding assistant with access to tools for executing commands, reading files, and writing files. 

You work in a sandboxed Docker environment where you can safely run commands and manipulate files.

When the user asks you to do something:
1. Break it down into steps
2. Use the available tools to accomplish the task
3. Provide clear explanations of what you're doing
4. Show the results of your actions

Available tools:
- run_shell: Execute shell commands in the Docker sandbox
- read_file: Read file contents from the workspace
- write_file: Write content to a file in the workspace

Be concise but thorough. Focus on getting things done.`;

/**
 * Main agent loop
 */
async function runAgent(session: Session, userMessage: string) {
  logger.info({ sessionId: session.getId(), userMessage }, "Processing user message");

  // Add user message to session
  session.addUserMessage(userMessage);

  // Build prompt context
  const messages = session.buildPromptContext(SYSTEM_PROMPT);

  // Generate response with tools
  const result = await generateText({
    model,
    messages,
    tools,
    maxSteps: 10, // Allow multiple tool calls in sequence
  });

  // Extract usage
  const usage = extractUsage(result.usage);
  logger.info({ usage }, "Generation completed");

  // Add assistant response to session
  // Handle responses with tool calls but no text content
  const responseText = result.text || "(Used tools to complete the task)";
  session.addAssistantMessage(responseText, usage.totalTokens);

  // Update token count
  session.updateTokenCount(usage.inputTokens, usage.outputTokens);

  // Check if compaction is needed
  const compacted = await session.checkAndCompact();
  if (compacted) {
    logger.info("Conversation compacted successfully");
  }

  return result;
}

/**
 * Show interactive session selector
 */
async function selectSession(): Promise<string | null> {
  const sessions = getAllSessions(10);
  
  const choices = [
    { name: "🆕 Start new session", value: "new" },
    { name: "─".repeat(50), value: "separator", disabled: true },
  ];
  
  if (sessions.length > 0) {
    for (const session of sessions) {
      const date = new Date(session.updated_at * 1000).toLocaleString();
      const hasMessages = session.summary_text ? "📝" : "💬";
      const preview = session.summary_text 
        ? session.summary_text.substring(0, 60) + "..." 
        : "Empty session";
      
      choices.push({
        name: `${hasMessages} ${session.id.substring(0, 8)}... (${date}) - ${preview}`,
        value: session.id,
      });
    }
  } else {
    choices.push({
      name: "No previous sessions found",
      value: "separator",
      disabled: true,
    });
  }
  
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "sessionId",
      message: "Select a session:",
      choices,
      loop: false,
    },
  ]);
  
  return answer.sessionId === "new" ? null : answer.sessionId;
}

/**
 * CLI loop for interactive usage
 */
async function cliLoop(skipSelector: boolean = false) {
  logger.info("Starting CLI loop");

  // Load session - show selector by default unless skipSelector is true
  let session: Session;
  
  if (skipSelector) {
    // Skip selector and create new session directly
    session = await Session.loadOrCreate();
    logger.info({ sessionId: session.getId() }, "Created new session");
  } else {
    // Show interactive session selector (default behavior)
    const selectedSessionId = await selectSession();
    if (selectedSessionId) {
      session = await Session.loadOrCreate(selectedSessionId);
      logger.info({ sessionId: session.getId() }, "Loaded selected session");
    } else {
      session = await Session.loadOrCreate();
      logger.info({ sessionId: session.getId() }, "Created new session");
    }
  }
  
  logger.info({ sessionId: session.getId() }, "Session ready");

  console.log("\n🤖 Context-Compacting Coding Agent");
  console.log("=====================================");
  console.log(`Session ID: ${session.getId()}`);
  console.log(`Model: ${config.model}`);
  console.log(`Max Tokens: ${config.maxTokens.toLocaleString()}`);
  console.log(`Compact At: ${config.compactAtTokens.toLocaleString()} (${config.compactAtPercent}%)`);
  console.log("\nType your message and press Enter. Type 'exit' to quit.\n");

  // Create readline interface after session selection to avoid conflicts
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    const userInput = await rl.question("You: ");

    if (userInput.trim().toLowerCase() === "exit") {
      logger.info("User requested exit");
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    try {
      const result = await runAgent(session, userInput);

      const displayText = result.text || "(Used tools to complete the task)";
      console.log("\nAssistant:", displayText);

      // Show tool calls if any
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log("\n📦 Tool Calls:");
        for (const call of result.toolCalls) {
          console.log(`  - ${call.toolName}`);
        }
      }

      // Show token usage
      const state = session.getState();
      console.log(`\n📊 Tokens: ${state.totalTokens.toLocaleString()} / ${config.maxTokens.toLocaleString()}\n`);
    } catch (error: any) {
      logger.error({ error }, "Error processing message");
      console.error("\n❌ Error:", error.message);
      console.log();
    }
  }

  rl.close();
  logger.info("CLI loop ended");
}

/**
 * Demo task for testing
 */
async function runDemo() {
  logger.info("Running demo task");

  // Create new session for demo
  const session = await Session.loadOrCreate();

  console.log("\n🤖 Running Demo Task");
  console.log("====================\n");

  const demoTask = "Create a simple hello world Node.js script in a file called demo.js, then run it.";

  console.log("Task:", demoTask);
  console.log("\nProcessing...\n");

  const result = await runAgent(session, demoTask);

  console.log("Assistant:", result.text);
  console.log("\n✅ Demo completed");
}

/**
 * Main function
 */
async function main() {
  logger.info("Starting context-compacting coding agent");

  // Initialize database
  logger.info("Initializing database");
  initDB();
  runMigrations();

  // Ensure Docker container is ready
  logger.info("Ensuring Docker container is ready");
  await ensureContainer();

  // Parse command line args
  const args = process.argv.slice(2);
  logger.info({ args, fullArgv: process.argv }, "Command line arguments received");
  const skipSelector = args.includes("--new") || args.includes("-n");
  const mode = args.find(arg => !arg.startsWith("--") && !arg.startsWith("-")) || "cli";
  logger.info({ skipSelector, mode }, "Parsed arguments");

  if (mode === "demo") {
    await runDemo();
  } else {
    await cliLoop(skipSelector);
  }

  logger.info("Agent shutdown complete");
}

// Run the agent
main().catch((error) => {
  logger.error(
    {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      cause: error?.cause,
    },
    "Fatal error"
  );
  process.exit(1);
});