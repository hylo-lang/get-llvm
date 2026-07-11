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

function architectureForArchive(platform: NodeJS.Platform, arch: string): string {
  switch (arch) {
    case "arm64":
      return platform === "linux" ? "aarch64" : "arm64";
    case "x64":
      return "x86_64";
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

function tripleSuffixForArchive(platform: NodeJS.Platform): string {
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

function getArchiveFileName(
  version: string,
  architecture: string,
  platform: string,
  buildConfig: BuildConfig,
) {
  return `llvm-${version}-${architecture}-${platform}-${buildConfig}.tar.zst`;
}

function assertPresent<T>(value: T | undefined | null): asserts value is T {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }
  if (value === null) {
    throw new Error("Value is null");
  }
}

function normalizePathSeparators(p: string) {
  return p.replaceAll("\\", "/");
}

export class ToolsGetter {
  private static readonly LOCAL_CACHE_NAME = "local-llvm-cache";
  private static readonly DOWNLOAD_URL_PREFIX =
    "https://github.com/hylo-lang/llvm-build/releases/download";

  private readonly llvmBuildArchitecture: string;
  private readonly llvmBuildTripleSuffix: string;

  public constructor(
    private readonly options: LlvmOptions,
    private readonly ports: Ports,
  ) {
    this.core.info(`llvm version: ${options.llvmVersion}`);
    this.core.info(`llvm build release: ${options.llvmBuildRelease}`);
    this.core.info(`useCloudCache: ${options.useCloudCache}`);
    this.core.info(`useLocalCache: ${options.useLocalCache}`);
    this.llvmBuildArchitecture =
      options.llvmBuildArchitecture || architectureForArchive(this.env.platform(), this.env.arch());
    this.llvmBuildTripleSuffix =
      options.llvmBuildTripleSuffix || tripleSuffixForArchive(this.env.platform());
  }

  private get core(): ActionsCore {
    return this.ports.core;
  }
  private get cloudCache(): CloudCache {
    return this.ports.cloudCache;
  }
  private get localCache(): LocalToolCache {
    return this.ports.localCache;
  }
  private get downloader(): Downloader {
    return this.ports.downloader;
  }
  private get fs(): FileSystem {
    return this.ports.fs;
  }
  private get toolchain(): Toolchain {
    return this.ports.toolchain;
  }
  private get env(): Environment {
    return this.ports.env;
  }

  public async run(): Promise<void> {
    let hashedKey: number | undefined;
    let outPath: string | undefined;
    let cloudCacheHitKey: string | undefined = undefined;
    let localCacheHit = false;
    let localPath: string | undefined = undefined;

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
      outPath = this.getOutputPath(hashedKey.toString());
      this.core.info(`Local install root: '${outPath}''.`);
    });

    assertPresent(hashedKey);
    assertPresent(outPath);

    if (this.options.useLocalCache) {
      await this.core.group(
        `Restoring from local GitHub runner cache using key '${hashedKey}'`,
        async () => {
          assertPresent(hashedKey);

          localPath = this.localCache.find(
            ToolsGetter.LOCAL_CACHE_NAME,
            ToolsGetter.convertHashToFakeSemver(hashedKey),
            this.env.platform(),
          );
          // Silly tool-cache API does return an empty string in case of cache miss.
          localCacheHit = !!localPath;

          this.core.info(localCacheHit ? "Local cache hit." : "Local cache miss.");
        },
      );
    }

    if (!localCacheHit) {
      if (this.options.useCloudCache) {
        await this.core.group(
          `Restoring from GitHub cloud cache using key '${hashedKey}' into '${outPath}'`,
          async () => {
            assertPresent(outPath);
            assertPresent(hashedKey);

            cloudCacheHitKey = await this.restoreCache(outPath, hashedKey);
            this.core.info(
              cloudCacheHitKey === undefined ? "Cloud cache miss." : "Cloud cache hit.",
            );
          },
        );
      }

      if (cloudCacheHitKey === undefined) {
        await this.downloadAndExtractLLVM(archiveFileName, outPath);
      }

      localPath = outPath;
    }

    if (!localPath) {
      throw new Error(`Unexpectedly the directory of the tools is not defined`);
    }

    const llvmRootFolder = normalizePathSeparators(
      path.join(outPath, archiveFileName.replace(".tar.zst", "")),
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
        assertPresent(outPath);
        assertPresent(hashedKey);

        if (localCacheHit) {
          this.core.info(
            "Skipping saving to cloud cache since there was local cache hit for the computed key.",
          );
        } else if (cloudCacheHitKey === undefined) {
          await this.saveCache(outPath, hashedKey);
          this.core.info(`Saved '${outPath}' to the GitHub cache service with key '${hashedKey}'.`);
        } else {
          this.core.info(
            "Skipping saving to cloud cache since there was a cache hit for the computed key.",
          );
        }
      });
    }

    if (this.options.useLocalCache && !localCacheHit && localPath) {
      await this.core.group(
        `Saving to local cache using key '${hashedKey}' from '${outPath}'`,
        async () => {
          assertPresent(localPath);
          assertPresent(hashedKey);

          await this.localCache.cacheDir(
            localPath,
            ToolsGetter.LOCAL_CACHE_NAME,
            ToolsGetter.convertHashToFakeSemver(hashedKey),
            this.env.platform(),
          );
          this.core.info(
            `Saved '${outPath}' to the local GitHub runner cache with key '${hashedKey}'.`,
          );
        },
      );
    }
  }

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

  async verifyLLVMConfigVersionInDirectory(llvmBin: string) {
    return this.core.group(`Verifying llvm-config in ${llvmBin}`, async () => {
      const llvmConfigPath = path.join(llvmBin, "llvm-config");
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

  private async doAddToPkgConfigPath(folder: string): Promise<void> {
    await this.core.group(`Adding pkg-config folder to PKG_CONFIG_PATH`, async () => {
      this.core.info(`Adding '${folder}' to PKG_CONFIG_PATH`);
      const currentPath = this.env.pkgConfigPath();
      const newPath = folder + path.delimiter + currentPath;
      this.core.exportVariable("PKG_CONFIG_PATH", newPath);
      this.core.info(`PKG_CONFIG_PATH is now: ${newPath}`);
    });
  }

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

  private getOutputPath(subDir: string): string {
    const runnerTemp = this.env.runnerTemp();
    if (!runnerTemp)
      throw new Error(
        "Environment variable process.env.RUNNER_TEMP must be set, it is used as destination directory of the cache",
      );
    return path.join(runnerTemp, subDir);
  }

  private saveCache(outPath: string, key: number): Promise<void> {
    return this.cloudCache.save([outPath], key.toString());
  }

  private restoreCache(outPath: string, key: number): Promise<string | undefined> {
    return this.cloudCache.restore([outPath], key.toString());
  }

  private async verifyDirectoryExists(dirPath: string): Promise<void> {
    if (!(await this.fs.directoryExists(dirPath))) {
      throw new Error(`Directory '${dirPath}' does not exist.`);
    }
  }

  private async downloadAndExtractLLVM(archiveFileName: string, outputPath: string): Promise<void> {
    const url = `${ToolsGetter.DOWNLOAD_URL_PREFIX}/${this.options.llvmBuildRelease}/${archiveFileName}`;
    await this.downloader.downloadAndExtract(url, outputPath);
  }

  private static convertHashToFakeSemver(hashedKey: number): string {
    // Since the key may be negative and needs to drop the sign to work good as
    // a major version number, let's ensure an unique version by switching the patch part.
    const minorPatch = hashedKey > 0 ? ".0.0" : ".0.1";
    return `${Math.abs(hashedKey)}${minorPatch}`;
  }

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

export async function main(ports: Ports): Promise<void> {
  const { core, env } = ports;
  try {
    const llvmGetter = new ToolsGetter(readOptions(core), ports);
    await llvmGetter.run();
    core.info("get-llvm action execution succeeded");
    env.exit(0);
  } catch (err) {
    const error: Error = err as Error;
    if (error?.stack) {
      core.error(error.stack);
    }
    const errorAsString = (err ?? "undefined error").toString();
    core.setFailed(`get-llvm action execution failed: '${errorAsString}'`);
    env.exit(-1000);
  }
}
