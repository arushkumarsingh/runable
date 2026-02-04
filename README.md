# Runable - Context-Compacting Coding Agent

An intelligent coding agent that maintains long conversations without hitting context limits through automatic conversation compaction and session management.

## 📺 Demo Video

[![Runable Demo](https://img.youtube.com/vi/fmOVTugQTq4/maxresdefault.jpg)](https://youtu.be/fmOVTugQTq4)

**Watch the demo:** [https://youtu.be/fmOVTugQTq4](https://youtu.be/fmOVTugQTq4)

---

## 🔥 The Stress Test Demo

**Want to see the scary parts actually work?** Run ONE command:

```bash
npm run test
```

This automatically:
1. ✅ Starts a long multi-step task
2. ✅ Forces context compaction mid-conversation
3. ✅ **Kills the Docker container** (literally runs `docker kill` - not simulated!)
4. ✅ Auto-recovers and recreates container
5. ✅ Resumes the session from database
6. ✅ Completes the task successfully
7. ✅ Prints final results with verification

**Translation:** *"I didn't just build it — I tested the parts that actually break."*

**Note:** The test actually kills the running Docker container and proves recovery works. Make sure you've built the Docker image first:
```bash
docker build -f src/docker/sandbox.Dockerfile -t runable-sandbox:latest .
```

## 🌟 Features

- **Automatic Context Compaction**: Intelligently summarizes old messages when approaching token limits
- **Session Persistence**: All conversations saved to SQLite - resume anytime
- **Interactive Session Selector**: Browse and resume previous sessions with arrow keys
- **Docker Sandbox**: Safe code execution in isolated containers with crash recovery
- **Smart Memory Management**: Keeps recent messages verbatim, summarizes older ones

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+) or Bun
- Docker Desktop (running)
- Vercel Gateway API key

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd runable

# Install dependencies
npm install
# or
bun install

# Configure environment
cp .env.example .env
# Add your VERCEL_GATEWAY_KEY to .env
```

### Running

```bash
# Start with interactive session selector
npm start

# Create new session (skip selector)
npm run start:new

# Or use bun
bun run index.ts
```

## 📖 How It Works

1. **Session Selection**: Start the app to see an interactive menu of all your previous sessions or start fresh
2. **Conversation**: Chat with the AI agent - it can execute shell commands, read/write files in the Docker sandbox
3. **Auto Compaction**: When conversation reaches 75% of max tokens (configurable), older messages are automatically summarized
4. **Resume Anytime**: Exit and restart - pick up any conversation right where you left off

## 🔧 Configuration

Edit `.env` to customize:

```env
VERCEL_GATEWAY_KEY=your_key_here
MODEL=anthropic/claude-sonnet-4.5
MAX_TOKENS=20000                # Maximum context window
COMPACT_AT_PERCENT=75          # Trigger compaction at this % of max
KEEP_RECENT_MESSAGES=10        # Number of recent messages to keep verbatim
DOCKER_IMAGE=runable-sandbox:latest
LOG_LEVEL=info
```

## 📂 Project Structure

```
runable/
├── index.ts                    # Main entry point
├── src/
│   ├── agent/
│   │   ├── session.ts         # Session management
│   │   ├── compactor.ts       # Conversation compaction logic
│   │   ├── tools.ts           # Agent tools (shell, read, write)
│   │   └── tokenCounter.ts    # Token tracking
│   ├── config/
│   │   └── env.ts             # Environment configuration
│   ├── db/
│   │   ├── client.ts          # SQLite operations
│   │   ├── schema.ts          # Database schema
│   │   └── migrations.ts      # Database migrations
│   ├── docker/
│   │   └── manager.ts         # Docker container management
│   └── utils/
│       └── logger.ts          # Logging utility
├── tests/
│   ├── stress-test.ts         # Automated stress test (npm run test)
│   └── test-all.ts            # Unit tests
└── TESTING.md                 # Comprehensive testing guide
```

## 🧪 Testing

### Automated Stress Test (Recommended!)

The stress test automatically demonstrates all critical features:

```bash
npm run test
```

This runs a comprehensive scenario that:
- Creates multiple files across several conversation turns
- Triggers automatic compaction when approaching token limits
- Kills the Docker container mid-conversation
- Proves the system auto-recovers
- Resumes the session from SQLite
- Verifies all data persisted correctly

**Perfect for quickly validating the entire system works.**

### Manual Testing

```bash
# Interactive session selector
npm start

# Create new session
npm run start:new
```


## 🛠️ Key Technologies

- **AI SDK**: Vercel AI SDK for LLM integration
- **Database**: SQLite with better-sqlite3
- **Docker**: Dockerode for container management
- **CLI**: Inquirer for interactive prompts
- **Logging**: Pino for structured logging

## 📝 Notes

- Sessions persist to SQLite - all conversations are saved automatically
- Docker container auto-recovers from crashes
- Compaction may trigger multiple times in long conversations (this is normal)
- First run automatically creates the database

## 🔒 Security

- Code execution is sandboxed in Docker containers
- No file access outside the workspace directory
- Database stored locally (not cloud-synced)

## 📄 License

MIT

---

Built for handling extended coding conversations without losing context 🚀
