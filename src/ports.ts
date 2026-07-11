// Copyright (c) 2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

// Ports for the hexagonal architecture: the domain logic in `get-llvm.ts`
// depends only on these interfaces. Real implementations live in
// `adapters.ts` (wrapping @actions/*, node fs and child_process); in-memory
// fakes used by the tests live in `tests/support/fakes.ts`.

/** Which flavour of the prebuilt LLVM archive to install. */
export type BuildConfig = "MinSizeRel" | "Debug";

/** Everything needed to install one specific prebuilt LLVM archive. */
export interface LlvmOptions {
  /** Fully qualified LLVM version, e.g. `"20.1.6"`; also the expected `llvm-config --version`. */
  llvmVersion: string;
  /** The hylo-lang/llvm-build release tag the archive is downloaded from. */
  llvmBuildRelease: string;
  /** Overrides the auto-detected archive architecture token (e.g. `"x86_64"`); auto-detected when omitted. */
  llvmBuildArchitecture?: string;
  /** Overrides the auto-detected archive OS/ABI token (e.g. `"unknown-linux-gnu"`); auto-detected when omitted. */
  llvmBuildTripleSuffix?: string;
  /** Which build flavour of the archive to fetch. */
  llvmBuildConfig: BuildConfig;
  /** When true, prepend the LLVM `bin` directory to PATH and verify `llvm-config`. */
  addToPath: boolean;
  /** When true, add the pkgconfig directory to PKG_CONFIG_PATH and verify pkg-config. */
  addToPkgConfigPath: boolean;
  /** When true, use the GitHub cloud cache (hosted runners). */
  useCloudCache: boolean;
  /** When true, use the local runner tool cache (self-hosted runners). */
  useLocalCache: boolean;
}

/** The `@actions/core` surface: action inputs, outputs, exported state and logging. */
export interface ActionsCore {
  /** Returns the action input `name`, or an empty string when it is unset. */
  getInput(name: string): string;
  /** Sets the action output `name` to `value`. */
  setOutput(name: string, value: string): void;
  /** Exports `name=value` into the environment of subsequent steps. */
  exportVariable(name: string, value: string): void;
  /** Prepends `path` to PATH for subsequent steps. */
  addPath(path: string): void;
  /** Marks the action as failed with `message` (sets a non-zero exit code). */
  setFailed(message: string): void;
  /** Writes an informational log line. */
  info(message: string): void;
  /** Writes a debug log line (visible only when step debugging is enabled). */
  debug(message: string): void;
  /** Writes a warning annotation. */
  warning(message: string): void;
  /** Writes an error annotation. */
  error(message: string): void;
  /** Runs `fn` inside a collapsible log group and resolves to its result. */
  group<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

/** GitHub cloud cache (`@actions/cache`). */
export interface CloudCache {
  /** Restores `paths` for `key`; resolves to the matched key on a hit, or undefined on a miss. */
  restore(paths: string[], key: string): Promise<string | undefined>;
  /** Saves `paths` under `key`; resolves once stored (a no-op on a benign save conflict). */
  save(paths: string[], key: string): Promise<void>;
}

/** Local runner tool cache (`@actions/tool-cache`). */
export interface LocalToolCache {
  /** Returns the cached directory for the tool, or an empty string on a cache miss. */
  find(toolName: string, version: string, arch: string): string;
  /** Copies `sourceDir` into the tool cache and resolves to the cached directory path. */
  cacheDir(sourceDir: string, toolName: string, version: string, arch: string): Promise<string>;
}

/** Downloads and extracts a remote archive into a directory. */
export interface Downloader {
  /** Downloads `url` and extracts it into `outputPath`. */
  downloadAndExtract(url: string, outputPath: string): Promise<void>;
}

/** Filesystem queries the domain needs. */
export interface FileSystem {
  /** Resolves to true when `path` exists and is accessible, false otherwise. */
  directoryExists(path: string): Promise<boolean>;
}

/** Runs external toolchain commands (`@actions/io` + `child_process`). */
export interface Toolchain {
  /** Resolves a tool on PATH to its absolute path; rejects when `check` is set and it is missing. */
  which(tool: string, check?: boolean): Promise<string>;
  /** Runs `command` synchronously and returns its trimmed stdout; throws on a non-zero exit. */
  run(command: string): string;
}

/** Ambient runtime facts and process control. */
export interface Environment {
  /** The host operating system. */
  platform(): NodeJS.Platform;
  /** The host CPU architecture (e.g. `"x64"`, `"arm64"`). */
  arch(): NodeJS.Architecture;
  /** The RUNNER_TEMP directory used as the install/cache destination, or undefined when unset. */
  runnerTemp(): string | undefined;
  /** The current PKG_CONFIG_PATH, or an empty string when unset. */
  pkgConfigPath(): string;
  /** Terminates the process with `code` (see the adapter for the workaround it applies). */
  exit(code: number): void;
}

/** The full set of ports the domain depends on. */
export interface Ports {
  /** Action inputs, outputs and logging. */
  core: ActionsCore;
  /** GitHub cloud cache. */
  cloudCache: CloudCache;
  /** Local runner tool cache. */
  localCache: LocalToolCache;
  /** Archive download + extraction. */
  downloader: Downloader;
  /** Filesystem queries. */
  fs: FileSystem;
  /** External toolchain command execution. */
  toolchain: Toolchain;
  /** Ambient runtime facts and process control. */
  env: Environment;
}
