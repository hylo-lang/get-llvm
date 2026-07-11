// Copyright (c) 2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

// Ports for the hexagonal architecture: the domain logic in `get-llvm.ts`
// depends only on these interfaces. Real implementations live in
// `adapters.ts` (wrapping @actions/*, node fs and child_process); in-memory
// fakes used by the tests live in `tests/support/fakes.ts`.

export type BuildConfig = "MinSizeRel" | "Debug";

/** Everything needed to install a specific LLVM build. */
export interface LlvmOptions {
  llvmVersion: string;
  llvmBuildRelease: string;
  llvmBuildArchitecture?: string;
  llvmBuildTripleSuffix?: string;
  llvmBuildConfig: BuildConfig;
  addToPath: boolean;
  addToPkgConfigPath: boolean;
  useCloudCache: boolean;
  useLocalCache: boolean;
}

/** The `@actions/core` surface: inputs, outputs, exported state and logging. */
export interface ActionsCore {
  getInput(name: string): string;
  setOutput(name: string, value: string): void;
  exportVariable(name: string, value: string): void;
  addPath(path: string): void;
  setFailed(message: string): void;
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  group<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

/** GitHub cloud cache (`@actions/cache`). */
export interface CloudCache {
  restore(paths: string[], key: string): Promise<string | undefined>;
  save(paths: string[], key: string): Promise<void>;
}

/** Local runner tool cache (`@actions/tool-cache`). */
export interface LocalToolCache {
  /** Returns the cached directory, or an empty string on a cache miss. */
  find(toolName: string, version: string, arch: string): string;
  cacheDir(sourceDir: string, toolName: string, version: string, arch: string): Promise<string>;
}

/** Downloads and extracts an archive to a directory. */
export interface Downloader {
  downloadAndExtract(url: string, outputPath: string): Promise<void>;
}

/** Filesystem queries the domain needs. */
export interface FileSystem {
  directoryExists(path: string): Promise<boolean>;
}

/** Runs external toolchain commands (`@actions/io` + `child_process`). */
export interface Toolchain {
  /** Resolves a tool on PATH, throwing when `check` is set and it is missing. */
  which(tool: string, check?: boolean): Promise<string>;
  /** Runs a command synchronously and returns its trimmed stdout. */
  run(command: string): string;
}

/** Ambient runtime facts and process control. */
export interface Environment {
  platform(): NodeJS.Platform;
  arch(): string;
  /** The RUNNER_TEMP directory, or undefined when not set. */
  runnerTemp(): string | undefined;
  pkgConfigPath(): string;
  exit(code: number): void;
}

/** The full set of ports the domain depends on. */
export interface Ports {
  core: ActionsCore;
  cloudCache: CloudCache;
  localCache: LocalToolCache;
  downloader: Downloader;
  fs: FileSystem;
  toolchain: Toolchain;
  env: Environment;
}
