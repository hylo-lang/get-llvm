// Copyright (c) 2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

// In-memory fakes for the ports. Tests construct `new Fakes()`, tweak a few
// fields, pass it where a `Ports` is expected, and then assert on the recorded
// calls. No module mocking, prototype spying or real filesystem/network.

import {
  ActionsCore,
  CloudCache,
  Downloader,
  Environment,
  FileSystem,
  LlvmOptions,
  LocalToolCache,
  Ports,
  Toolchain,
} from "../../src/ports";

export class FakeCore implements ActionsCore {
  inputs: Record<string, string> = {};
  outputs: Record<string, string> = {};
  exported: Record<string, string> = {};
  addedPaths: string[] = [];
  failed: string[] = [];
  errors: string[] = [];
  infos: string[] = [];

  getInput(name: string): string {
    return this.inputs[name] ?? "";
  }
  setOutput(name: string, value: string): void {
    this.outputs[name] = value;
  }
  exportVariable(name: string, value: string): void {
    this.exported[name] = value;
  }
  addPath(path: string): void {
    this.addedPaths.push(path);
  }
  setFailed(message: string): void {
    this.failed.push(message);
  }
  info(message: string): void {
    this.infos.push(message);
  }
  debug(): void {}
  warning(): void {}
  error(message: string): void {
    this.errors.push(message);
  }
  group<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class FakeCloudCache implements CloudCache {
  restoreCalls: { paths: string[]; key: string }[] = [];
  saveCalls: { paths: string[]; key: string }[] = [];
  /** Value returned by `restore`: a string means a cache hit, undefined a miss. */
  restoreResult: string | undefined = undefined;
  /** When set, `restore` rejects (simulating a cache service failure). */
  restoreThrows = false;

  async restore(paths: string[], key: string): Promise<string | undefined> {
    this.restoreCalls.push({ paths, key });
    if (this.restoreThrows) {
      throw new Error("cloud cache restore failed");
    }
    return this.restoreResult;
  }
  async save(paths: string[], key: string): Promise<void> {
    this.saveCalls.push({ paths, key });
  }
}

export class FakeLocalToolCache implements LocalToolCache {
  findCalls: { toolName: string; version: string; arch: string }[] = [];
  cacheDirCalls: { sourceDir: string; toolName: string; version: string; arch: string }[] = [];
  /** Value returned by `find`: a non-empty string means a cache hit. */
  findResult = "";

  find(toolName: string, version: string, arch: string): string {
    this.findCalls.push({ toolName, version, arch });
    return this.findResult;
  }
  async cacheDir(
    sourceDir: string,
    toolName: string,
    version: string,
    arch: string,
  ): Promise<string> {
    this.cacheDirCalls.push({ sourceDir, toolName, version, arch });
    return sourceDir;
  }
}

export class FakeDownloader implements Downloader {
  calls: { url: string; outputPath: string }[] = [];

  async downloadAndExtract(url: string, outputPath: string): Promise<void> {
    this.calls.push({ url, outputPath });
  }
}

export class FakeFileSystem implements FileSystem {
  queried: string[] = [];
  /** Whether `directoryExists` reports directories as present. */
  exists = true;

  async directoryExists(path: string): Promise<boolean> {
    this.queried.push(path);
    return this.exists;
  }
}

export class FakeToolchain implements Toolchain {
  runCalls: string[] = [];
  /** Version reported by `llvm-config`/`pkg-config` version queries. */
  llvmConfigVersion = "20.1.6";
  whichResult = "/fake/bin/tool";

  async which(_tool: string, _check?: boolean): Promise<string> {
    return this.whichResult;
  }
  run(command: string): string {
    this.runCalls.push(command);
    if (command.includes("--version") || command.includes("--modversion")) {
      return this.llvmConfigVersion;
    }
    return "";
  }
}

export class FakeEnvironment implements Environment {
  platformValue: NodeJS.Platform = "linux";
  archValue = "x64";
  runnerTempValue: string | undefined = "/tmp/runner-temp";
  pkgConfigPathValue = "";
  exitCalls: number[] = [];

  platform(): NodeJS.Platform {
    return this.platformValue;
  }
  arch(): string {
    return this.archValue;
  }
  runnerTemp(): string | undefined {
    return this.runnerTempValue;
  }
  pkgConfigPath(): string {
    return this.pkgConfigPathValue;
  }
  exit(code: number): void {
    this.exitCalls.push(code);
  }
}

/** A full set of in-memory fakes that also satisfies the `Ports` interface. */
export class Fakes implements Ports {
  core = new FakeCore();
  cloudCache = new FakeCloudCache();
  localCache = new FakeLocalToolCache();
  downloader = new FakeDownloader();
  fs = new FakeFileSystem();
  toolchain = new FakeToolchain();
  env = new FakeEnvironment();
}

/** Sensible default install options; override just what a test cares about. */
export function options(overrides: Partial<LlvmOptions> = {}): LlvmOptions {
  return {
    llvmVersion: "20.1.6",
    llvmBuildRelease: "20250910-063105",
    llvmBuildConfig: "MinSizeRel",
    addToPath: false,
    addToPkgConfigPath: false,
    useCloudCache: false,
    useLocalCache: false,
    ...overrides,
  };
}
