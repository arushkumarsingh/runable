import Docker from "dockerode";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Docker manager for sandbox execution with crash recovery
 */

// Windows Docker Desktop uses named pipes
const docker = new Docker();

// Container name for persistence
const CONTAINER_NAME = "runable-sandbox";

let containerInstance: Docker.Container | null = null;

/**
 * Ensure the container exists and is running
 * Creates or starts the container as needed
 */
export async function ensureContainer(): Promise<void> {
  try {
    // Try to get existing container
    const container = docker.getContainer(CONTAINER_NAME);
    
    try {
      const info = await container.inspect();
      
      if (info.State.Running) {
        containerInstance = container;
        logger.debug({ containerName: CONTAINER_NAME }, "Container already running");
        return;
      }
      
      // Container exists but not running - start it
      await container.start();
      containerInstance = container;
      logger.info({ containerName: CONTAINER_NAME }, "Started existing container");
      return;
    } catch (err: any) {
      // Container doesn't exist, create it
      if (err.statusCode === 404) {
        await createContainer();
        return;
      }
      throw err;
    }
  } catch (error) {
    logger.error({ error }, "Failed to ensure container");
    throw error;
  }
}

/**
 * Create a new container
 */
async function createContainer(): Promise<void> {
  logger.info({
    image: config.docker.image,
    name: CONTAINER_NAME,
    workdir: config.docker.workdir,
  }, "Creating new container");

  const container = await docker.createContainer({
    Image: config.docker.image,
    name: CONTAINER_NAME,
    WorkingDir: config.docker.workdir,
    Cmd: ["/bin/sh", "-c", "sleep infinity"], // Keep container alive
    HostConfig: {
      AutoRemove: false,
      Binds: [
        `${process.cwd()}:${config.docker.workdir}:rw`, // Mount workspace
      ],
    },
  });

  await container.start();
  containerInstance = container;
  
  logger.info({ containerName: CONTAINER_NAME }, "Container created and started");
}

/**
 * Execute a command in the container
 */
export async function exec(
  cmd: string,
  timeoutMs: number = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  await ensureContainer();
  
  if (!containerInstance) {
    throw new Error("Container not initialized");
  }

  logger.debug({ cmd, timeoutMs }, "Executing command in container");

  try {
    const execInstance = await containerInstance.exec({
      Cmd: ["/bin/sh", "-c", cmd],
      AttachStdout: true,
      AttachStderr: true,
    });

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      execInstance.start({ hijack: true }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        if (!stream) {
          clearTimeout(timer);
          return reject(new Error("No stream returned"));
        }

        let stdout = "";
        let stderr = "";

        // Docker multiplexes stdout/stderr in a single stream
        // Header: [stream_type, 0, 0, 0, size1, size2, size3, size4]
        stream.on("data", (chunk: Buffer) => {
          const header = chunk.subarray(0, 8);
          const payload = chunk.subarray(8);
          
          const streamType = header[0];
          
          if (streamType === 1) {
            // stdout
            stdout += payload.toString();
          } else if (streamType === 2) {
            // stderr
            stderr += payload.toString();
          }
        });

        stream.on("end", async () => {
          clearTimeout(timer);
          
          try {
            const inspectData = await execInstance.inspect();
            const exitCode = inspectData.ExitCode ?? 0;
            
            logger.debug({ exitCode, stdoutLength: stdout.length, stderrLength: stderr.length }, "Command completed");
            
            resolve({ stdout, stderr, exitCode });
          } catch (error) {
            reject(error);
          }
        });

        stream.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    });
  } catch (error: any) {
    logger.error({ error, cmd }, "Command execution failed");
    
    // If container crashed, try to recreate and retry once
    if (error.message?.includes("container") || error.statusCode === 404) {
      logger.warn("Container may have crashed, attempting recovery");
      await recreateContainer();
      
      // Retry once
      return exec(cmd, timeoutMs);
    }
    
    throw error;
  }
}

/**
 * Recreate the container from scratch
 */
export async function recreateContainer(): Promise<void> {
  logger.info({ containerName: CONTAINER_NAME }, "Recreating container");

  try {
    // Try to remove existing container
    if (containerInstance) {
      try {
        await containerInstance.stop({ t: 5 });
        await containerInstance.remove({ force: true });
      } catch (err) {
        // Ignore errors if container is already gone
        logger.debug({ error: err }, "Error removing old container (may not exist)");
      }
    }

    containerInstance = null;
    
    // Create new container
    await createContainer();
    
    logger.info("Container recreated successfully");
  } catch (error) {
    logger.error({ error }, "Failed to recreate container");
    throw error;
  }
}

/**
 * Stop and remove the container
 */
export async function stopContainer(): Promise<void> {
  if (!containerInstance) {
    return;
  }

  logger.info({ containerName: CONTAINER_NAME }, "Stopping container");

  try {
    await containerInstance.stop({ t: 5 });
    await containerInstance.remove({ force: true });
    containerInstance = null;
    
    logger.info("Container stopped and removed");
  } catch (error) {
    logger.error({ error }, "Failed to stop container");
    throw error;
  }
}
