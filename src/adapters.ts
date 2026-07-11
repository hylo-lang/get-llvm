// Copyright (c) 2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

// Real adapters: thin wrappers that satisfy the ports in `ports.ts` using the
// GitHub Actions toolkit, node's filesystem and child_process. All I/O against
// the outside world lives here so the domain in `get-llvm.ts` stays pure.

import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as io from "@actions/io";
import * as tools from "@actions/tool-cache";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import {
  ActionsCore,
  CloudCache,
  Downloader,
  Environment,
  FileSystem,
  LocalToolCache,
  Ports,
  Toolchain,
} from "./ports";

/** Adapts `@actions/core` to the {@link ActionsCore} port. */
class ActionsCoreAdapter implements ActionsCore {
  /** Returns the action input `name`, or an empty string when it is unset. */
  getInput(name: string): string {
    return core.getInput(name);
  }
  /** Sets the action output `name` to `value`. */
  setOutput(name: string, value: string): void {
    core.setOutput(name, value);
  }
  /** Exports `name=value` into the environment of subsequent steps. */
  exportVariable(name: string, value: string): void {
    core.exportVariable(name, value);
  }
  /** Prepends `path` to PATH for subsequent steps. */
  addPath(path: string): void {
    core.addPath(path);
  }
  /** Marks the action as failed with `message`. */
  setFailed(message: string): void {
    core.setFailed(message);
  }
  /** Writes an informational log line. */
  info(message: string): void {
    core.info(message);
  }
  /** Writes a debug log line. */
  debug(message: string): void {
    core.debug(message);
  }
  /** Writes a warning annotation. */
  warning(message: string): void {
    core.warning(message);
  }
  /** Writes an error annotation. */
  error(message: string): void {
    core.error(message);
  }
  /** Runs `body` inside a collapsible log group and resolves to its result. */
  group<T>(name: string, body: () => Promise<T>): Promise<T> {
    return core.group(name, body);
  }
}

/** Adapts `@actions/cache` to the {@link CloudCache} port. */
class ActionsCloudCache implements CloudCache {
  /** Restores `paths` for `key`; resolves to the matched key on a hit, or undefined on a miss. */
  restore(paths: string[], key: string): Promise<string | undefined> {
    return cache.restoreCache(paths, key);
  }
  /**
   * Saves `paths` under `key`. Re-throws validation errors; treats reserve
   * conflicts and other cache-service errors as non-fatal (logged, then ignored).
   */
  async save(paths: string[], key: string): Promise<void> {
    try {
      await cache.saveCache(paths, key);
    } catch (error: any) {
      if (error.name === cache.ValidationError.name) {
        throw error;
      } else if (error.name === cache.ReserveCacheError.name) {
        core.info(error.message);
      } else {
        core.warning(error.message);
      }
    }
  }
}

/** Adapts `@actions/tool-cache`'s local cache to the {@link LocalToolCache} port. */
class ActionsLocalToolCache implements LocalToolCache {
  /** Returns the cached directory for the tool, or null on a cache miss (tool-cache uses ""). */
  find(toolName: string, version: string, architecture: string): string | null {
    return tools.find(toolName, version, architecture) || null;
  }
  /** Copies `sourceDirectory` into the tool cache and resolves to the cached directory path. */
  cacheDir(
    sourceDirectory: string,
    toolName: string,
    version: string,
    architecture: string,
  ): Promise<string> {
    return tools.cacheDir(sourceDirectory, toolName, version, architecture);
  }
}

/** Adapts `@actions/tool-cache`'s download + extract to the {@link Downloader} port. */
class ToolCacheDownloader implements Downloader {
  /** Downloads `url` and extracts the (zstd tar) archive into `outputPath`. */
  async downloadAndExtract(url: string, outputPath: string): Promise<void> {
    core.info(`Downloading LLVM from '${url}'`);
    const downloaded = await tools.downloadTool(url);
    core.info("Extracting archive from " + downloaded);
    await tools.extractTar(downloaded, outputPath, ["-x", "--zstd"]);
  }
}

/** Adapts node's `fs/promises` to the {@link FileSystem} port. */
class NodeFileSystem implements FileSystem {
  /** Resolves to true when `path` is accessible, false otherwise. */
  async directoryExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

/** Adapts `@actions/io` and `child_process` to the {@link Toolchain} port. */
class SystemToolchain implements Toolchain {
  /** Resolves a tool on PATH to its absolute path; rejects when `check` is set and it is missing. */
  which(tool: string, check?: boolean): Promise<string> {
    return io.which(tool, check);
  }
  /** Runs `command` synchronously and returns its trimmed stdout; throws on a non-zero exit. */
  run(command: string): string {
    return execSync(command, { encoding: "utf8" }).trim();
  }
}

/** Adapts node's `process` to the {@link Environment} port. */
class ProcessEnvironment implements Environment {
  /** The host operating system. */
  platform(): NodeJS.Platform {
    return process.platform;
  }
  /** The host CPU architecture. */
  architecture(): NodeJS.Architecture {
    return process.arch;
  }
  /** The RUNNER_TEMP directory, or undefined when unset. */
  runnerTemp(): string | undefined {
    return process.env.RUNNER_TEMP;
  }
  /** The current PKG_CONFIG_PATH, or an empty string when unset. */
  pkgConfigPath(): string {
    return process.env.PKG_CONFIG_PATH || "";
  }
  /** Terminates the process with `code`, working around processes that fail to exit. */
  exit(code: number): void {
    // Work around processes that fail to terminate, see:
    //  - https://github.com/lukka/get-cmake/issues/136
    //  - https://github.com/nodejs/node/issues/47228
    process.exitCode = code;
    process.exit(code);
  }
}

/** Builds the set of production adapters wiring the domain to the real world. */
export function defaultPorts(): Ports {
  return {
    core: new ActionsCoreAdapter(),
    cloudCache: new ActionsCloudCache(),
    localCache: new ActionsLocalToolCache(),
    downloader: new ToolCacheDownloader(),
    fileSystem: new NodeFileSystem(),
    toolchain: new SystemToolchain(),
    environment: new ProcessEnvironment(),
  };
}
