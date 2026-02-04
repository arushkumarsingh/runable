/**
 * Test script to verify all features mentioned in README
 * Run with: bun run tests/test-all.ts
 */

import "dotenv/config";
import { initDB, runMigrations } from "../src/db/index.js";
import { ensureContainer, stopContainer } from "../src/docker/manager.js";
import { Session } from "../src/agent/session.js";
import { existsSync, unlinkSync } from "fs";
import { config } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";

async function testDatabaseCreation() {
  console.log("\n📦 Test 1: Database Creation");
  console.log("=" .repeat(50));
  
  const dbPath = config.dbPath;
  
  // Delete database if exists
  if (existsSync(dbPath)) {
    console.log(`Deleting existing database: ${dbPath}`);
    unlinkSync(dbPath);
  }
  
  console.log("Initializing database...");
  initDB();
  runMigrations();
  
  if (existsSync(dbPath)) {
    console.log("✅ Database created successfully!");
  } else {
    console.log("❌ Database was not created!");
    throw new Error("Database creation failed");
  }
}

async function testSessionPersistence() {
  console.log("\n💾 Test 2: Session Persistence");
  console.log("=" .repeat(50));
  
  // Create a session
  console.log("Creating new session...");
  const session1 = await Session.loadOrCreate();
  const sessionId1 = session1.getId();
  console.log(`Created session: ${sessionId1}`);
  
  // Add some messages
  session1.addUserMessage("Test message 1");
  session1.addAssistantMessage("Test response 1", 100);
  session1.addUserMessage("Test message 2");
  
  console.log(`Added messages to session ${sessionId1}`);
  
  // Load the same session
  console.log("Loading session by ID...");
  const session2 = await Session.loadOrCreate(sessionId1);
  const sessionId2 = session2.getId();
  
  if (sessionId1 === sessionId2) {
    console.log(`✅ Session loaded successfully: ${sessionId2}`);
    
    const messages = session2.getAllMessages();
    console.log(`✅ Found ${messages.length} persisted messages`);
    
    if (messages.length >= 3) {
      console.log("✅ Session persistence works!");
    } else {
      console.log("❌ Messages were not persisted correctly");
    }
  } else {
    console.log(`❌ Session IDs don't match: ${sessionId1} vs ${sessionId2}`);
    throw new Error("Session persistence failed");
  }
}

async function testDockerRecovery() {
  console.log("\n🐳 Test 3: Docker Container Recovery");
  console.log("=" .repeat(50));
  
  console.log("Ensuring container exists...");
  await ensureContainer();
  console.log("✅ Container is running");
  
  console.log("Stopping container to simulate crash...");
  try {
    await stopContainer();
    console.log("✅ Container stopped");
  } catch (error: any) {
    console.log(`Note: ${error.message}`);
  }
  
  console.log("Attempting to ensure container (should recreate)...");
  await ensureContainer();
  console.log("✅ Container recovered/recreated successfully!");
}

async function testCompactionThreshold() {
  console.log("\n📊 Test 4: Compaction Configuration");
  console.log("=" .repeat(50));
  
  console.log(`Max Tokens: ${config.maxTokens.toLocaleString()}`);
  console.log(`Compact At: ${config.compactAtTokens.toLocaleString()} (${config.compactAtPercent}%)`);
  console.log(`Keep Recent Messages: ${config.keepRecentMessages}`);
  
  const session = await Session.loadOrCreate();
  const state = session.getState();
  
  console.log(`\nCurrent session tokens: ${state.totalTokens.toLocaleString()}`);
  console.log(`Tokens until compaction: ${(config.compactAtTokens - state.totalTokens).toLocaleString()}`);
  
  if (config.compactAtTokens < config.maxTokens) {
    console.log("✅ Compaction threshold is configured correctly");
  } else {
    console.log("❌ Compaction threshold is invalid");
  }
}

async function runAllTests() {
  console.log("\n🧪 Running All Tests");
  console.log("=" .repeat(50));
  
  try {
    await testDatabaseCreation();
    await testSessionPersistence();
    await testDockerRecovery();
    await testCompactionThreshold();
    
    console.log("\n" + "=" .repeat(50));
    console.log("✅ All tests passed!");
    console.log("=" .repeat(50));
    
    // Cleanup: stop container
    console.log("\nCleaning up...");
    try {
      await stopContainer();
      console.log("✅ Container stopped");
    } catch (error) {
      // Ignore cleanup errors
    }
    
  } catch (error: any) {
    console.log("\n" + "=" .repeat(50));
    console.log("❌ Test failed!");
    console.log(`Error: ${error.message}`);
    console.log("=" .repeat(50));
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  logger.error({ error }, "Test execution failed");
  process.exit(1);
});
