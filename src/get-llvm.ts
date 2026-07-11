// Copyright (c) 2020-2021-2022-2023-2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from "path";
import {
  ActionsCore,
  BuildConfig,
  CloudCache,
  Downloader,
  Environment,
  FileSystem,
  LlvmOptions,
  LocalToolCache,
  Ports,
  Toolchain,
} from "./ports";
import { hashCode } from "./utils";

/** The architecture token used in an llvm-build archive file name. */
type ArchiveArchitecture = "aarch64" | "arm64" | "x86_64";

/** The OS/ABI ("triple suffix") token used in an llvm-build archive file name. */
type ArchiveTripleSuffix = "unknown-linux-gnu" | "apple-darwin24.1.0" | "unknown-windows-msvc17";

/** Maps a runner platform/architecture to the archive architecture token; throws on an unsupported architecture. */
function architectureForArchive(
  platform: NodeJS.Platform,
  architecture: NodeJS.Architecture,
): ArchiveArchitecture {
  switch (architecture) {
    case "arm64":
      return platform === "linux" ? "aarch64" : "arm64";
    case "x64":
      return "x86_64";
    default:
      throw new Error(`Unsupported architecture: ${architecture}`);
  }
}

/** Maps a runner platform to the archive OS/ABI token; throws on an unsupported platform. */
function tripleSuffixForArchive(platform: NodeJS.Platform): ArchiveTripleSuffix {
  switch (platform) {
    case "linux":
      return "unknown-linux-gnu";
    case "darwin":
      return "apple-darwin24.1.0";
    case "win32":
      return "unknown-windows-msvc17";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Builds the archive file name, e.g.
 * `llvm-20.1.6-x86_64-unknown-linux-gnu-MinSizeRel.tar.zst`. `architecture` and
 * `platform` are plain strings because they may be caller-supplied overrides.
 */
function getArchiveFileName(
  version: string,
  architecture: string,
  platform: string,
  buildConfig: BuildConfig,
): string {
  return `llvm-${version}-${architecture}-${platform}-${buildConfig}.tar.zst`;
}

/** Narrows `value` to be defined, throwing if it is null or undefined. */
function assertPresent<T>(value: T | undefined | null): asserts value is T {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }
  if (value === null) {
    throw new Error("Value is null");
  }
}

/** Returns `filePath` with every backslash replaced by a forward slash. */
function normalizePathSeparators(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

/**
 * Downloads (or restores from cache) a prebuilt LLVM archive, exposes its
 * directories as action outputs, and optionally puts it on PATH. All external
 * effects go through the injected {@link Ports}.
 */
export class ToolsGetter {
  /** Tool-cache entry name used for the local runner cache. */
  private static readonly LOCAL_CACHE_NAME = "local-llvm-cache";
  /** Base URL the LLVM archives are downloaded from. */
  private static readonly DOWNLOAD_URL_PREFIX =
    "https://github.com/hylo-lang/llvm-build/releases/download";

  /** Resolved archive architecture token (option override, else auto-detected). */
  private readonly llvmBuildArchitecture: string;
  /** Resolved archive OS/ABI token (option override, else auto-detected). */
  private readonly llvmBuildTripleSuffix: string;

  /** Resolves the archive architecture/triple from `options` or the runtime environment. */
  public constructor(
    private readonly options: LlvmOptions,
    private readonly ports: Ports,
  ) {
    this.core.info(`llvm version: ${options.llvmVersion}`);
    this.core.info(`llvm build release: ${options.llvmBuildRelease}`);
    this.core.info(`useCloudCache: ${options.useCloudCache}`);
    this.core.info(`useLocalCache: ${options.useLocalCache}`);
    this.llvmBuildArchitecture =
      options.llvmBuildArchitecture ||
      architectureForArchive(this.environment.platform(), this.environment.architecture());
    this.llvmBuildTripleSuffix =
      options.llvmBuildTripleSuffix || tripleSuffixForArchive(this.environment.platform());
  }

  /** Shorthand for the action inputs/outputs/logging port. */
  private get core(): ActionsCore {
    return this.ports.core;
  }
  /** Shorthand for the cloud cache port. */
  private get cloudCache(): CloudCache {
    return this.ports.cloudCache;
  }
  /** Shorthand for the local tool cache port. */
  private get localCache(): LocalToolCache {
    return this.ports.localCache;
  }
  /** Shorthand for the download/extract port. */
  private get downloader(): Downloader {
    return this.ports.downloader;
  }
  /** Shorthand for the filesystem port. */
  private get fileSystem(): FileSystem {
    return this.ports.fileSystem;
  }
  /** Shorthand for the toolchain command port. */
  private get toolchain(): Toolchain {
    return this.ports.toolchain;
  }
  /** Shorthand for the environment port. */
  private get environment(): Environment {
    return this.ports.environment;
  }

  /**
   * Installs LLVM end to end: resolve a cache key, try the local then cloud
   * cache, download on a miss, verify the extracted layout, publish outputs,
   * optionally update PATH/PKG_CONFIG_PATH, and save back to the caches.
   */
  public async run(): Promise<void> {
    let hashedKey: number | undefined;
    let outputPath: string | undefined;
    let cloudCacheHitKey: string | undefined = undefined;
    let localCacheHit = false;
    let localPath: string | null | undefined = undefined;

    const archiveFileName = getArchiveFileName(
      this.options.llvmVersion,
      this.llvmBuildArchitecture,
      this.llvmBuildTripleSuffix,
      this.options.llvmBuildConfig,
    );

    await this.core.group(`Computing cache key from the downloads' URLs`, async () => {
      // Get an unique output directory name from the URL.
      const cacheKey = archiveFileName + "-" + this.options.llvmBuildRelease;
      hashedKey = hashCode(cacheKey);
      this.core.info(`Cache key: '${cacheKey}'.`);
      this.core.debug(`hash('${cacheKey}') === '${hashedKey}'`);
      outputPath = this.getOutputPath(hashedKey.toString());
      this.core.info(`Local install root: '${outputPath}''.`);
    });

    assertPresent(hashedKey);
    assertPresent(outputPath);

    if (this.options.useLocalCache) {
      await this.core.group(
        `Restoring from local GitHub runner cache using key '${hashedKey}'`,
        async () => {
          assertPresent(hashedKey);

          localPath = this.localCache.find(
            ToolsGetter.LOCAL_CACHE_NAME,
            ToolsGetter.convertHashToFakeSemver(hashedKey),
            this.environment.platform(),
          );
          localCacheHit = localPath !== null;

          this.core.info(localCacheHit ? "Local cache hit." : "Local cache miss.");
        },
      );
    }

    if (!localCacheHit) {
      if (this.options.useCloudCache) {
        await this.core.group(
          `Restoring from GitHub cloud cache using key '${hashedKey}' into '${outputPath}'`,
          async () => {
            assertPresent(outputPath);
            assertPresent(hashedKey);

            cloudCacheHitKey = await this.restoreCache(outputPath, hashedKey);
            this.core.info(
              cloudCacheHitKey === undefined ? "Cloud cache miss." : "Cloud cache hit.",
            );
          },
        );
      }

      if (cloudCacheHitKey === undefined) {
        await this.downloadAndExtractLLVM(archiveFileName, outputPath);
      }

      localPath = outputPath;
    }

    if (!localPath) {
      throw new Error(`Unexpectedly the directory of the tools is not defined`);
    }

    const llvmRootFolder = normalizePathSeparators(
      path.join(outputPath, archiveFileName.replace(".tar.zst", "")),
    );
    this.core.setOutput("llvmRootDirectory", llvmRootFolder);
    this.core.info(`LLVM root directory: ${llvmRootFolder}`);
    await this.verifyDirectoryExists(llvmRootFolder);

    const llvmBinDirectory = normalizePathSeparators(path.join(llvmRootFolder, "bin"));
    this.core.setOutput("llvmBinDirectory", llvmBinDirectory);
    this.core.info(`LLVM bin directory: ${llvmBinDirectory}`);
    await this.verifyDirectoryExists(llvmBinDirectory);
    await this.verifyLLVMConfigVersionInDirectory(llvmBinDirectory);

    const llvmPkgConfigDirectory = normalizePathSeparators(path.join(llvmRootFolder, "pkgconfig"));
    this.core.setOutput("llvmPkgConfigDirectory", llvmPkgConfigDirectory);
    this.core.info(`LLVM pkgconfig directory: ${llvmPkgConfigDirectory}`);
    await this.verifyDirectoryExists(llvmPkgConfigDirectory);

    const llvmLibDirectory = normalizePathSeparators(path.join(llvmRootFolder, "lib"));
    this.core.setOutput("llvmLibDirectory", llvmLibDirectory);
    this.core.info(`LLVM lib directory: ${llvmLibDirectory}`);
    await this.verifyDirectoryExists(llvmLibDirectory);

    const llvmCmakeDirectory = normalizePathSeparators(
      path.join(llvmLibDirectory, "cmake", "llvm"),
    );
    this.core.setOutput("llvmCmakeDirectory", llvmCmakeDirectory);
    this.core.info(`LLVM cmake directory: ${llvmCmakeDirectory}`);
    await this.verifyDirectoryExists(llvmCmakeDirectory);

    const lldCmakeDirectory = normalizePathSeparators(path.join(llvmLibDirectory, "cmake", "lld"));
    this.core.setOutput("lldCmakeDirectory", lldCmakeDirectory);
    this.core.info(`LLD cmake directory: ${lldCmakeDirectory}`);
    await this.verifyDirectoryExists(lldCmakeDirectory);

    this.core.setOutput("llvmVersion", this.options.llvmVersion);
    this.core.info(`LLVM version: ${this.options.llvmVersion}`);

    if (this.options.addToPath) {
      await this.addLLVMBinToPath(llvmRootFolder);
      await this.verifyLlvmConfigOnPath();
    }

    if (this.options.addToPkgConfigPath) {
      await this.doAddToPkgConfigPath(llvmPkgConfigDirectory);
      await this.verifyPkgConfig();
    }

    if (this.options.useCloudCache && cloudCacheHitKey === undefined) {
      await this.core.group(`Saving to GitHub cloud cache using key '${hashedKey}'`, async () => {
        assertPresent(outputPath);
        assertPresent(hashedKey);

        if (localCacheHit) {
          this.core.info(
            "Skipping saving to cloud cache since there was local cache hit for the computed key.",
          );
        } else if (cloudCacheHitKey === undefined) {
          await this.saveCache(outputPath, hashedKey);
          this.core.info(
            `Saved '${outputPath}' to the GitHub cache service with key '${hashedKey}'.`,
          );
        } else {
          this.core.info(
            "Skipping saving to cloud cache since there was a cache hit for the computed key.",
          );
        }
      });
    }

    if (this.options.useLocalCache && !localCacheHit && localPath) {
      await this.core.group(
        `Saving to local cache using key '${hashedKey}' from '${outputPath}'`,
        async () => {
          assertPresent(localPath);
          assertPresent(hashedKey);

          await this.localCache.cacheDir(
            localPath,
            ToolsGetter.LOCAL_CACHE_NAME,
            ToolsGetter.convertHashToFakeSemver(hashedKey),
            this.environment.platform(),
          );
          this.core.info(
            `Saved '${outputPath}' to the local GitHub runner cache with key '${hashedKey}'.`,
          );
        },
      );
    }
  }

  /** Asserts `llvm-config` resolves on PATH and reports the expected version. */
  async verifyLlvmConfigOnPath() {
    return this.core.group(`Verifying llvm-config is on PATH`, async () => {
      const llvmConfigWhichPath: string = await this.toolchain.which("llvm-config", true);
      this.core.info(`Actual path to llvm-config is: '${llvmConfigWhichPath}'`);

      const llvmConfigVersion = this.toolchain.run("llvm-config --version");

      this.core.info(`llvm-config version is: '${llvmConfigVersion}'`);
      if (llvmConfigVersion !== this.options.llvmVersion) {
        throw new Error(
          `llvm-config on PATH has a version mismatch: expected ${this.options.llvmVersion}, got ${llvmConfigVersion}`,
        );
      }
    });
  }

  /** Asserts the `llvm-config` in `llvmBinDirectory` reports the expected version. */
  async verifyLLVMConfigVersionInDirectory(llvmBinDirectory: string) {
    return this.core.group(`Verifying llvm-config in ${llvmBinDirectory}`, async () => {
      const llvmConfigPath = path.join(llvmBinDirectory, "llvm-config");
      this.core.info(`Actual path to llvm-config is: '${llvmConfigPath}'`);

      const llvmConfigVersion = this.toolchain.run(`"${llvmConfigPath}" --version`);
      this.core.info(`llvm-config version is: '${llvmConfigVersion}'`);
      if (llvmConfigVersion !== this.options.llvmVersion) {
        throw new Error(
          `llvm-config version mismatch: expected ${this.options.llvmVersion}, got ${llvmConfigVersion}`,
        );
      }
    });
  }

  /** Prepends `folder` to PKG_CONFIG_PATH for subsequent steps. */
  private async doAddToPkgConfigPath(folder: string): Promise<void> {
    await this.core.group(`Adding pkg-config folder to PKG_CONFIG_PATH`, async () => {
      this.core.info(`Adding '${folder}' to PKG_CONFIG_PATH`);
      const currentPath = this.environment.pkgConfigPath();
      const newPath = folder + path.delimiter + currentPath;
      this.core.exportVariable("PKG_CONFIG_PATH", newPath);
      this.core.info(`PKG_CONFIG_PATH is now: ${newPath}`);
    });
  }

  /** Adds `<llvmRootFolder>/bin` to PATH and checks `llvm-config`/`clang` resolve there. */
  private async addLLVMBinToPath(llvmRootFolder: string): Promise<void> {
    await this.core.group(`Add LLVM's bin to PATH`, async () => {
      const llvmBinPath = path.join(llvmRootFolder, "bin");
      this.core.info("LLVM bin directory: " + llvmBinPath);
      this.core.addPath(llvmBinPath);

      await this.core.group(`Validating the installed LLVM paths`, async () => {
        const llvmWhichPath: string = await this.toolchain.which("llvm-config", true);
        this.core.info(`Actual path to llvm-config is: '${llvmWhichPath}'`);

        const clangWhichPath: string = await this.toolchain.which("clang", true);
        this.core.info(`Actual path to clang is: '${clangWhichPath}'`);
      });
    });
  }

  /** Returns `<RUNNER_TEMP>/<subDirectory>`; throws when RUNNER_TEMP is unset. */
  private getOutputPath(subDirectory: string): string {
    const runnerTemp = this.environment.runnerTemp();
    if (!runnerTemp)
      throw new Error(
        "The RUNNER_TEMP environment variable must be set; it is used as the destination directory of the cache",
      );
    return path.join(runnerTemp, subDirectory);
  }

  /** Saves `outputPath` to the cloud cache under the stringified `key`. */
  private saveCache(outputPath: string, key: number): Promise<void> {
    return this.cloudCache.save([outputPath], key.toString());
  }

  /** Restores `outputPath` from the cloud cache; resolves to the matched key or undefined on a miss. */
  private restoreCache(outputPath: string, key: number): Promise<string | undefined> {
    return this.cloudCache.restore([outputPath], key.toString());
  }

  /** Throws unless `directoryPath` exists on disk. */
  private async verifyDirectoryExists(directoryPath: string): Promise<void> {
    if (!(await this.fileSystem.directoryExists(directoryPath))) {
      throw new Error(`Directory '${directoryPath}' does not exist.`);
    }
  }

  /** Downloads the release archive `archiveFileName` and extracts it into `outputPath`. */
  private async downloadAndExtractLLVM(archiveFileName: string, outputPath: string): Promise<void> {
    const url = `${ToolsGetter.DOWNLOAD_URL_PREFIX}/${this.options.llvmBuildRelease}/${archiveFileName}`;
    await this.downloader.downloadAndExtract(url, outputPath);
  }

  /**
   * Encodes a (possibly negative) hash as a valid semver string for the
   * tool-cache version field: `|hash|` as major, `.0.0` for positive hashes and
   * `.0.1` for negative ones to keep the mapping unique.
   */
  private static convertHashToFakeSemver(hashedKey: number): string {
    const minorPatch = hashedKey > 0 ? ".0.0" : ".0.1";
    return `${Math.abs(hashedKey)}${minorPatch}`;
  }

  /** Asserts pkg-config finds the `llvm` package and reports the expected version. */
  private async verifyPkgConfig(): Promise<void> {
    await this.core.group(`Verifying pkg-config setup`, async () => {
      // Check if pkg-config can find the llvm package.
      this.toolchain.run("pkg-config --exists llvm");
      this.core.info("✓ pkg-config can find the llvm package");

      // Get the version from pkg-config.
      const pkgConfigVersion = this.toolchain.run("pkg-config --modversion llvm");
      if (pkgConfigVersion !== this.options.llvmVersion) {
        throw new Error(
          `pkg-config version mismatch: expected ${this.options.llvmVersion}, got ${pkgConfigVersion}`,
        );
      }
      this.core.info(`✓ pkg-config reports LLVM version: ${pkgConfigVersion}`);

      // Get the cflags from pkg-config.
      const pkgConfigCflags = this.toolchain.run("pkg-config --cflags llvm");
      this.core.info(`✓ pkg-config cflags: ${pkgConfigCflags}`);

      // Get the libs from pkg-config.
      const pkgConfigLibs = this.toolchain.run("pkg-config --libs llvm");
      this.core.info(`✓ pkg-config libs: ${pkgConfigLibs}`);
    });
  }
}

/** Reads and normalizes the action inputs into {@link LlvmOptions}, applying defaults. */
function readOptions(core: ActionsCore): LlvmOptions {
  return {
    llvmVersion: core.getInput("llvmVersion"),
    llvmBuildRelease: core.getInput("llvmBuildRelease"),
    llvmBuildArchitecture: core.getInput("llvmBuildArchitecture") || undefined,
    llvmBuildTripleSuffix: core.getInput("llvmBuildTripleSuffix") || undefined,
    llvmBuildConfig: (core.getInput("llvmBuildConfig") as BuildConfig) || "MinSizeRel",
    addToPath: (core.getInput("addToPath") || "true").toLowerCase() === "true",
    addToPkgConfigPath: (core.getInput("addToPkgConfigPath") || "true").toLowerCase() === "true",
    useCloudCache: (core.getInput("useCloudCache") || "true").toLowerCase() === "true",
    useLocalCache: (core.getInput("useLocalCache") || "false").toLowerCase() === "true",
  };
}

/**
 * Action entry point: reads inputs, runs the installer, and exits 0 on success
 * or -1000 after reporting failure. Never rejects — errors are turned into a
 * failed action status.
 */
export async function main(ports: Ports): Promise<void> {
  const { core, environment } = ports;
  try {
    const llvmGetter = new ToolsGetter(readOptions(core), ports);
    await llvmGetter.run();
    core.info("get-llvm action execution succeeded");
    environment.exit(0);
  } catch (caughtError) {
    const error: Error = caughtError as Error;
    if (error?.stack) {
      core.error(error.stack);
    }
    const errorAsString = (caughtError ?? "undefined error").toString();
    core.setFailed(`get-llvm action execution failed: '${errorAsString}'`);
    environment.exit(-1000);
  }
}
