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

class ActionsCoreAdapter implements ActionsCore {
  getInput(name: string): string {
    return core.getInput(name);
  }
  setOutput(name: string, value: string): void {
    core.setOutput(name, value);
  }
  exportVariable(name: string, value: string): void {
    core.exportVariable(name, value);
  }
  addPath(path: string): void {
    core.addPath(path);
  }
  setFailed(message: string): void {
    core.setFailed(message);
  }
  info(message: string): void {
    core.info(message);
  }
  debug(message: string): void {
    core.debug(message);
  }
  warning(message: string): void {
    core.warning(message);
  }
  error(message: string): void {
    core.error(message);
  }
  group<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return core.group(name, fn);
  }
}

class ActionsCloudCache implements CloudCache {
  restore(paths: string[], key: string): Promise<string | undefined> {
    return cache.restoreCache(paths, key);
  }
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

class ActionsLocalToolCache implements LocalToolCache {
  find(toolName: string, version: string, arch: string): string {
    return tools.find(toolName, version, arch);
  }
  cacheDir(sourceDir: string, toolName: string, version: string, arch: string): Promise<string> {
    return tools.cacheDir(sourceDir, toolName, version, arch);
  }
}

class ToolCacheDownloader implements Downloader {
  async downloadAndExtract(url: string, outputPath: string): Promise<void> {
    core.info(`Downloading LLVM from '${url}'`);
    const downloaded = await tools.downloadTool(url);
    core.info("Extracting archive from " + downloaded);
    await tools.extractTar(downloaded, outputPath, ["-x", "--zstd"]);
  }
}

class NodeFileSystem implements FileSystem {
  async directoryExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}

class SystemToolchain implements Toolchain {
  which(tool: string, check?: boolean): Promise<string> {
    return io.which(tool, check);
  }
  run(command: string): string {
    return execSync(command, { encoding: "utf8" }).trim();
  }
}

class ProcessEnvironment implements Environment {
  platform(): NodeJS.Platform {
    return process.platform;
  }
  arch(): string {
    return process.arch;
  }
  runnerTemp(): string | undefined {
    return process.env.RUNNER_TEMP;
  }
  pkgConfigPath(): string {
    return process.env.PKG_CONFIG_PATH || "";
  }
  exit(code: number): void {
    // Work around processes that fail to terminate, see:
    //  - https://github.com/lukka/get-cmake/issues/136
    //  - https://github.com/nodejs/node/issues/47228
    process.exitCode = code;
    process.exit(code);
  }
}

/** Builds the set of production adapters. */
export function defaultPorts(): Ports {
  return {
    core: new ActionsCoreAdapter(),
    cloudCache: new ActionsCloudCache(),
    localCache: new ActionsLocalToolCache(),
    downloader: new ToolCacheDownloader(),
    fs: new NodeFileSystem(),
    toolchain: new SystemToolchain(),
    env: new ProcessEnvironment(),
  };
}
