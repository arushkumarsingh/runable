import { tool, jsonSchema } from "ai";
import { z } from "zod";
import { exec } from "../docker/manager.js";
import { logger } from "../utils/logger.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Tool definitions for the coding agent
 * Keep it simple: shell execution, file read/write
 */

/**
 * Run shell command in Docker sandbox
 */
export const runShellTool = tool({
  description: "Execute a shell command in a sandboxed Docker container. Use this to run code, install packages, or perform system operations.",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
      },
    },
    required: ["command"],
  }),
  execute: async ({ command, timeoutMs = 30000 }: { command: string; timeoutMs?: number }) => {
    logger.info({ command, timeoutMs }, "Executing shell command");

    try {
      const result = await exec(command, timeoutMs);
      
      logger.info({ 
        command, 
        exitCode: result.exitCode, 
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length 
      }, "Shell command completed");

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error: any) {
      logger.error({ error, command }, "Shell command failed");
      return {
        success: false,
        exitCode: -1,
        stdout: "",
        stderr: error.message || "Command execution failed",
      };
    }
  },
});

/**
 * Read file from workspace
 */
export const readFileTool = tool({
  description: "Read the contents of a file from the workspace. Returns the file content as a string.",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file in the workspace",
      },
    },
    required: ["path"],
  }),
  execute: async ({ path }: { path: string }) => {
    logger.info({ path }, "Reading file");

    try {
      const fullPath = join(process.cwd(), path);
      
      if (!existsSync(fullPath)) {
        logger.warn({ path, fullPath }, "File not found");
        return {
          success: false,
          content: null,
          error: `File not found: ${path}`,
        };
      }

      const content = readFileSync(fullPath, "utf-8");
      
      logger.info({ path, contentLength: content.length }, "File read successfully");

      return {
        success: true,
        content,
        error: null,
      };
    } catch (error: any) {
      logger.error({ error, path }, "Failed to read file");
      return {
        success: false,
        content: null,
        error: error.message || "Failed to read file",
      };
    }
  },
});

/**
 * Write file to workspace
 */
export const writeFileTool = tool({
  description: "Write content to a file in the workspace. Creates the file if it doesn't exist, overwrites if it does.",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file in the workspace",
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
    },
    required: ["path", "content"],
  }),
  execute: async ({ path, content }: { path: string; content: string }) => {
    logger.info({ path, contentLength: content.length }, "Writing file");

    try {
      const fullPath = join(process.cwd(), path);
      
      writeFileSync(fullPath, content, "utf-8");
      
      logger.info({ path }, "File written successfully");

      return {
        success: true,
        path,
        error: null,
      };
    } catch (error: any) {
      logger.error({ error, path }, "Failed to write file");
      return {
        success: false,
        path,
        error: error.message || "Failed to write file",
      };
    }
  },
});

/**
 * Export all tools as a tools object
 */
export const tools = {
  run_shell: runShellTool,
  read_file: readFileTool,
  write_file: writeFileTool,
};
