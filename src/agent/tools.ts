import { tool } from "ai";
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
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
    timeoutMs: z.number().optional().default(30000).describe("Timeout in milliseconds (default: 30000)"),
  }),
  execute: async ({ command, timeoutMs }: { command: string; timeoutMs: number }) => {
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
  parameters: z.object({
    path: z.string().describe("Relative path to the file in the workspace"),
  }),
  execute: async ({ path }) => {
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
  parameters: z.object({
    path: z.string().describe("Relative path to the file in the workspace"),
    content: z.string().describe("Content to write to the file"),
  }),
  execute: async ({ path, content }) => {
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
