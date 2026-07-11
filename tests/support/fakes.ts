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

/** Recording fake for {@link ActionsCore}: inputs are seeded, everything else is captured. */
export class FakeCore implements ActionsCore {
  /** Input values returned by `getInput`, keyed by input name. */
  inputs: Record<string, string> = {};
  /** Outputs set via `setOutput`, keyed by name. */
  outputs: Record<string, string> = {};
  /** Variables exported via `exportVariable`, keyed by name. */
  exported: Record<string, string> = {};
  /** Paths passed to `addPath`, in call order. */
  addedPaths: string[] = [];
  /** Messages passed to `setFailed`, in call order. */
  failed: string[] = [];
  /** Messages passed to `error`, in call order. */
  errors: string[] = [];
  /** Messages passed to `info`, in call order. */
  infos: string[] = [];

  /** Returns the seeded input `name`, or an empty string when unset. */
  getInput(name: string): string {
    return this.inputs[name] ?? "";
  }
  /** Records an output value. */
  setOutput(name: string, value: string): void {
    this.outputs[name] = value;
  }
  /** Records an exported variable. */
  exportVariable(name: string, value: string): void {
    this.exported[name] = value;
  }
  /** Records an added PATH entry. */
  addPath(path: string): void {
    this.addedPaths.push(path);
  }
  /** Records a failure message. */
  setFailed(message: string): void {
    this.failed.push(message);
  }
  /** Records an info message. */
  info(message: string): void {
    this.infos.push(message);
  }
  /** Ignored (debug output is not asserted on). */
  debug(): void {}
  /** Ignored (warnings are not asserted on). */
  warning(): void {}
  /** Records an error message. */
  error(message: string): void {
    this.errors.push(message);
  }
  /** Runs `fn` directly, without any log grouping. */
  group<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/** Recording fake for {@link CloudCache} with a configurable restore outcome. */
export class FakeCloudCache implements CloudCache {
  /** Arguments of each `restore` call, in order. */
  restoreCalls: { paths: string[]; key: string }[] = [];
  /** Arguments of each `save` call, in order. */
  saveCalls: { paths: string[]; key: string }[] = [];
  /** Value returned by `restore`: a string means a cache hit, undefined a miss. */
  restoreResult: string | undefined = undefined;
  /** When true, `restore` rejects (simulating a cache service failure). */
  restoreThrows = false;

  /** Records the call and returns `restoreResult` (or throws when `restoreThrows`). */
  async restore(paths: string[], key: string): Promise<string | undefined> {
    this.restoreCalls.push({ paths, key });
    if (this.restoreThrows) {
      throw new Error("cloud cache restore failed");
    }
    return this.restoreResult;
  }
  /** Records the call. */
  async save(paths: string[], key: string): Promise<void> {
    this.saveCalls.push({ paths, key });
  }
}

/** Recording fake for {@link LocalToolCache} with a configurable find outcome. */
export class FakeLocalToolCache implements LocalToolCache {
  /** Arguments of each `find` call, in order. */
  findCalls: { toolName: string; version: string; arch: string }[] = [];
  /** Arguments of each `cacheDir` call, in order. */
  cacheDirCalls: { sourceDir: string; toolName: string; version: string; arch: string }[] = [];
  /** Value returned by `find`: a non-empty string means a cache hit. */
  findResult = "";

  /** Records the call and returns `findResult`. */
  find(toolName: string, version: string, arch: string): string {
    this.findCalls.push({ toolName, version, arch });
    return this.findResult;
  }
  /** Records the call and echoes back `sourceDir` as the cached path. */
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

/** Recording fake for {@link Downloader}; never touches the network. */
export class FakeDownloader implements Downloader {
  /** Arguments of each `downloadAndExtract` call, in order. */
  calls: { url: string; outputPath: string }[] = [];

  /** Records the call. */
  async downloadAndExtract(url: string, outputPath: string): Promise<void> {
    this.calls.push({ url, outputPath });
  }
}

/** Recording fake for {@link FileSystem} with a configurable existence answer. */
export class FakeFileSystem implements FileSystem {
  /** Paths passed to `directoryExists`, in order. */
  queried: string[] = [];
  /** Whether `directoryExists` reports directories as present. */
  exists = true;

  /** Records the query and returns `exists`. */
  async directoryExists(path: string): Promise<boolean> {
    this.queried.push(path);
    return this.exists;
  }
}

/** Recording fake for {@link Toolchain} that reports a configurable version. */
export class FakeToolchain implements Toolchain {
  /** Commands passed to `run`, in order. */
  runCalls: string[] = [];
  /** Version reported by `llvm-config`/`pkg-config` version queries. */
  llvmConfigVersion = "20.1.6";
  /** Path returned by `which`. */
  whichResult = "/fake/bin/tool";

  /** Returns `whichResult`. */
  async which(_tool: string, _check?: boolean): Promise<string> {
    return this.whichResult;
  }
  /** Records the command; returns `llvmConfigVersion` for version queries, else an empty string. */
  run(command: string): string {
    this.runCalls.push(command);
    if (command.includes("--version") || command.includes("--modversion")) {
      return this.llvmConfigVersion;
    }
    return "";
  }
}

/** Fake {@link Environment} with mutable ambient values and recorded exits. */
export class FakeEnvironment implements Environment {
  /** Value returned by `platform`. */
  platformValue: NodeJS.Platform = "linux";
  /** Value returned by `arch`. */
  archValue: NodeJS.Architecture = "x64";
  /** Value returned by `runnerTemp` (undefined simulates an unset RUNNER_TEMP). */
  runnerTempValue: string | undefined = "/tmp/runner-temp";
  /** Value returned by `pkgConfigPath`. */
  pkgConfigPathValue = "";
  /** Exit codes passed to `exit`, in order (the process is never actually exited). */
  exitCalls: number[] = [];

  /** Returns `platformValue`. */
  platform(): NodeJS.Platform {
    return this.platformValue;
  }
  /** Returns `archValue`. */
  arch(): NodeJS.Architecture {
    return this.archValue;
  }
  /** Returns `runnerTempValue`. */
  runnerTemp(): string | undefined {
    return this.runnerTempValue;
  }
  /** Returns `pkgConfigPathValue`. */
  pkgConfigPath(): string {
    return this.pkgConfigPathValue;
  }
  /** Records `code` instead of terminating the process. */
  exit(code: number): void {
    this.exitCalls.push(code);
  }
}

/** A full set of in-memory fakes that also satisfies the {@link Ports} interface. */
export class Fakes implements Ports {
  /** Recording action-core fake. */
  core = new FakeCore();
  /** Configurable cloud cache fake. */
  cloudCache = new FakeCloudCache();
  /** Configurable local tool cache fake. */
  localCache = new FakeLocalToolCache();
  /** Network-free downloader fake. */
  downloader = new FakeDownloader();
  /** Configurable filesystem fake. */
  fs = new FakeFileSystem();
  /** Configurable toolchain fake. */
  toolchain = new FakeToolchain();
  /** Mutable environment fake. */
  env = new FakeEnvironment();
}

/** Returns sensible default install options; override just what a test cares about. */
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
