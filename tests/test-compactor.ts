/**
 * Simple test script to demonstrate the compactor
 * Run with: bun run test-compactor.ts
 */

import { compactConversation } from "../src/agent/compactor.js";
import type { ModelMessage } from "ai";

async function testCompactor() {
  console.log("Testing compactor...\n");

  // Create a sample conversation with 25 messages
  const messages: ModelMessage[] = [
    { role: "user", content: "I need to build a REST API for a todo app" },
    { role: "assistant", content: "I can help you with that. Let's use Express and TypeScript. First, we'll need to set up the project structure." },
    { role: "user", content: "Sounds good. What dependencies do we need?" },
    { role: "assistant", content: "We'll need express, typescript, @types/express, and @types/node. Let me create a package.json." },
    { role: "user", content: "Also, I want to use PostgreSQL for the database" },
    { role: "assistant", content: "Great choice. We'll add pg and @types/pg to the dependencies. I'll also set up a connection pool." },
    { role: "user", content: "Can you create the database schema?" },
    { role: "assistant", content: "Here's a schema with users and todos tables. Users have id, email, and password. Todos have id, user_id, title, completed, and created_at." },
    { role: "user", content: "Let's implement the authentication first" },
    { role: "assistant", content: "I'll implement JWT-based authentication. We'll need jsonwebtoken and bcrypt packages." },
    { role: "user", content: "Make sure to hash the passwords securely" },
    { role: "assistant", content: "Yes, using bcrypt with 10 rounds. I've created the auth middleware and register/login endpoints." },
    { role: "user", content: "Now let's add the CRUD endpoints for todos" },
    { role: "assistant", content: "I've created GET /todos, POST /todos, PUT /todos/:id, and DELETE /todos/:id endpoints." },
    { role: "user", content: "Add validation to the endpoints" },
    { role: "assistant", content: "Added express-validator to validate request bodies. Title is required and must be a non-empty string." },
    { role: "user", content: "Can you add error handling?" },
    { role: "assistant", content: "Created a global error handler middleware that catches errors and returns proper JSON responses." },
    { role: "user", content: "Let's add pagination to the GET /todos endpoint" },
    { role: "assistant", content: "Added page and limit query parameters. Default limit is 10, max is 100." },
    { role: "user", content: "Can you add filtering by completed status?" },
    { role: "assistant", content: "Added ?completed=true/false query parameter to filter todos." },
    { role: "user", content: "Now let's add some tests" },
    { role: "assistant", content: "I'll use Jest and supertest. Creating test files for auth and todos endpoints." },
    { role: "user", content: "Make sure to mock the database" },
    { role: "assistant", content: "Using jest.mock() to mock the pg Pool. Tests are passing!" },
    { role: "user", content: "Finally, can you add a README with setup instructions?" },
  ];

  console.log(`Total messages: ${messages.length}`);
  console.log(`Messages to compact: ${messages.length - 20}`);
  console.log(`Messages to keep: 20\n`);

  const result = await compactConversation({
    messages,
  });

  console.log("=== COMPACTION RESULT ===\n");
  console.log(`Compacted ${result.compactedMessageCount} messages`);
  console.log(`Summary length: ${result.newSummary.length} characters`);
  console.log(`Token usage: ${result.usage.totalTokens} total\n`);
  console.log("=== NEW SUMMARY ===\n");
  console.log(result.newSummary);
}

testCompactor().catch(console.error);
