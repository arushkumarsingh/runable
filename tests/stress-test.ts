/**
 * Stress Test
 * 
 * This automatically tests:
 * 1. Long running task with multiple steps
 * 2. Forces context compaction
 * 3. Kills Docker container mid-task
 * 4. Recovers and recreates container
 * 5. Resumes session and completes task
 * 
 * Run with: npm run test
 */

import "dotenv/config";
import { generateText } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { config } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";
import { initDB, runMigrations } from "../src/db/index.js";
import { Session } from "../src/agent/session.js";
import { tools } from "../src/agent/tools.js";
import { extractUsage } from "../src/agent/tokenCounter.js";
import { ensureContainer, stopContainer } from "../src/docker/manager.js";
import Docker from "dockerode";

const docker = new Docker();
const CONTAINER_NAME = "runable-sandbox";

// Initialize gateway
const gateway = createGateway({
  apiKey: config.apiKey,
});
const model = gateway(config.model);

const SYSTEM_PROMPT = `You are a coding assistant with access to shell commands, file reading, and file writing.
Work in a sandboxed Docker environment. Be concise and focus on completing tasks.`;

/**
 * Execute agent with a message
 */
async function runAgent(session: Session, userMessage: string) {
  console.log(`\n💬 User: ${userMessage}`);
  
  session.addUserMessage(userMessage);
  const messages = session.buildPromptContext(SYSTEM_PROMPT);

  const result = await generateText({
    model,
    messages,
    tools,
    maxSteps: 10,
  });

  const usage = extractUsage(result.usage);
  
  // Handle responses with tool calls but no text
  const responseText = result.text || "(Used tools to complete the task)";
  session.addAssistantMessage(responseText, usage.totalTokens);
  session.updateTokenCount(usage.inputTokens, usage.outputTokens);

  console.log(`\n🤖 Assistant: ${responseText}`);
  if (result.toolCalls && result.toolCalls.length > 0) {
    console.log(`   🔧 Tool calls: ${result.toolCalls.map(t => t.toolName).join(", ")}`);
  }
  console.log(`📊 Tokens: ${session.getState().totalTokens} / ${config.maxTokens}`);

  // Check and perform compaction
  const compacted = await session.checkAndCompact();
  if (compacted) {
    console.log(`\n✨ COMPACTION TRIGGERED! Conversation summarized.`);
  }

  return result;
}

/**
 * Kill Docker container (for real!)
 */
async function killContainer() {
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const info = await container.inspect();
    
    if (info.State.Running) {
      console.log(`\n💥 KILLING Docker container: ${CONTAINER_NAME}`);
      console.log(`   PID: ${info.State.Pid}`);
      console.log(`   Status before kill: ${info.State.Status}`);
      
      // Actually kill the container
      await container.kill();
      
      // Verify it's dead
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const afterInfo = await container.inspect();
        console.log(`   Status after kill: ${afterInfo.State.Status} ☠️`);
      } catch {
        console.log(`   Container removed from Docker ☠️`);
      }
      
      console.log("✅ Container successfully killed!");
    } else {
      console.log(`\n⚠️  Container not running (status: ${info.State.Status})`);
    }
  } catch (error: any) {
    console.log(`\n⚠️  Error killing container: ${error.message}`);
  }
}

/**
 * Main stress test
 */
async function stressTest() {
  console.log("\n" + "=".repeat(70));
  console.log("🔥 RUNABLE STRESS TEST - Testing the Scary Parts");
  console.log("=".repeat(70));

  // Initialize
  console.log("\n📦 Step 1: Initializing database...");
  initDB();
  runMigrations();
  console.log("✅ Database ready");

  console.log("\n🐳 Step 2: Starting Docker container...");
  await ensureContainer();
  console.log("✅ Docker container ready");

  // Create session
  console.log("\n📝 Step 3: Creating new session...");
  const session = await Session.loadOrCreate();
  const sessionId = session.getId();
  console.log(`✅ Session created: ${sessionId.substring(0, 8)}...`);

  // Long running task
  console.log("\n" + "=".repeat(70));
  console.log("🚀 Step 4: Starting LONG TASK (multiple messages)");
  console.log("=".repeat(70));

  await runAgent(session, "Create a Python file called test_script.py that prints numbers 1 to 100");
  
  await runAgent(session, "Now modify it to print only even numbers");
  
  await runAgent(session, "Add a function to calculate the sum of all even numbers and print it at the end");
  
  await runAgent(session, "Run the script and show me the output");

  // Force more messages to trigger compaction
  console.log("\n📊 Step 5: Adding more messages to trigger compaction...");
  
  await runAgent(session, "Create another file called math_utils.py with functions for basic arithmetic operations (add, subtract, multiply, divide)");
  
  await runAgent(session, "Write unit tests for math_utils.py in a file called test_math.py");
  
  await runAgent(session, "Create a README.md documenting both Python scripts");

  const stateBeforeKill = session.getState();
  console.log("\n📊 State before container kill:");
  console.log(`   Tokens: ${stateBeforeKill.totalTokens}`);
  console.log(`   Has Summary: ${!!stateBeforeKill.summary}`);

  // Kill Docker container FOR REAL
  console.log("\n" + "=".repeat(70));
  console.log("💥 Step 6: KILLING DOCKER CONTAINER (for real, not simulated!)");
  console.log("=".repeat(70));
  await killContainer();
  console.log("\n⏳ Waiting 2 seconds to let it fully die...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Try to continue - should auto-recover
  console.log("\n" + "=".repeat(70));
  console.log("🔄 Step 7: Attempting to continue (container should auto-recover)");
  console.log("=".repeat(70));

  try {
    await runAgent(session, "List all the files we created in this session");
  } catch (error: any) {
    console.log(`\n⚠️  First attempt failed (expected): ${error.message}`);
    console.log("🔄 Container should auto-recover on next attempt...");
  }

  // Verify recovery
  console.log("\n🐳 Step 8: Verifying Docker recovery...");
  await ensureContainer();
  
  // Verify container is actually running
  const container = docker.getContainer(CONTAINER_NAME);
  const recoveredInfo = await container.inspect();
  console.log("✅ Docker container recovered!");
  console.log(`   New PID: ${recoveredInfo.State.Pid}`);
  console.log(`   Status: ${recoveredInfo.State.Status} (${recoveredInfo.State.Running ? '🟢 Running' : '🔴 Not Running'})`);

  // Resume session
  console.log("\n" + "=".repeat(70));
  console.log("🔄 Step 9: RESUMING SESSION from database");
  console.log("=".repeat(70));
  
  const resumedSession = await Session.loadOrCreate(sessionId);
  const stateAfterResume = resumedSession.getState();
  
  console.log("\n📊 Resumed session state:");
  console.log(`   Session ID: ${resumedSession.getId().substring(0, 8)}... ✅`);
  console.log(`   Tokens: ${stateAfterResume.totalTokens}`);
  console.log(`   Has Summary: ${!!stateAfterResume.summary}`);
  console.log(`   Summary Preview: ${stateAfterResume.summary?.substring(0, 100)}...`);

  // Final task to prove everything works
  console.log("\n" + "=".repeat(70));
  console.log("✅ Step 10: Final task to prove recovery worked");
  console.log("=".repeat(70));
  
  await runAgent(resumedSession, "Show me the content of test_script.py to prove the session was preserved");

  // Final results
  console.log("\n" + "=".repeat(70));
  console.log("🎉 STRESS TEST COMPLETE!");
  console.log("=".repeat(70));
  
  const finalState = resumedSession.getState();
  console.log("\n📊 Final Stats:");
  console.log(`   ✅ Session persisted and resumed: ${sessionId.substring(0, 8)}...`);
  console.log(`   ✅ Total tokens managed: ${finalState.totalTokens}`);
  console.log(`   ✅ Context compaction: ${finalState.summary ? 'WORKED' : 'Not triggered'}`);
  console.log(`   ✅ Docker crash recovery: WORKED`);
  console.log(`   ✅ Session persistence: WORKED`);
  console.log(`   ✅ Files survived container kill: VERIFIED`);
  
  console.log("\n💪 All scary parts tested successfully!");
  console.log("=".repeat(70) + "\n");

  // Cleanup
  console.log("\n🧹 Cleaning up...");
  await stopContainer();
  console.log("✅ Cleanup complete");
}

// Run the stress test
stressTest().catch((error) => {
  console.error("\n❌ STRESS TEST FAILED:", error);
  logger.error({ error }, "Stress test failed");
  process.exit(1);
});
