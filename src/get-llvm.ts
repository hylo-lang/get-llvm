// Copyright (c) 2020-2021-2022-2023-2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as io from "@actions/io";
import * as tools from "@actions/tool-cache";
import * as path from "path";
import * as fs from "fs/promises";
import { SemVer, maxSatisfying } from "semver";
import * as shared from "./releases-collector";
import { hashCode } from "./utils";

type BuildType = "MinSizeRel" | "Debug";

function getArchiveFileName(
  version: string,
  platform: NodeJS.Platform,
  architecture: string,
  buildType: BuildType
) {
  let fileName = "";
  fileName += "llvm-";
  fileName += version;
  fileName += "-";
  fileName += architecture;

  switch (process.arch) {
    case "arm64":
      fileName += "arm64";
      break;
    case "x64":
    case "x32":
      fileName += "x86_64";
      break;
    default:
      throw Error(`Unsupported architecture: ${process.arch}`);
  }

  fileName += "-";

  switch (platform) {
    case "win32":
      fileName += "unknown-windows-msvc17";
      break;
    case "linux":
      fileName += "unknown-linux-gnu";
      break;
    case "darwin":
      fileName += "apple-darwin24.1.0";
      break;
    default:
      throw Error(`Unsupported platform: ${platform}`);
  }

  fileName += "-";
  fileName += buildType;
  fileName += "tar.zst";

  return fileName;
}

function assertPresent<T>(value: T | undefined | null): asserts value is T {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }
  if (value === null) {
    throw new Error("Value is null");
  }
}

export class ToolsGetter {
  private static readonly LOCAL_CACHE_NAME = "local-llvm-cache";
  private static readonly DOWNLOAD_URL_PREFIX =
    "https://github.com/hylo-lang/llvm-build/releases/download";

  public constructor(
    private readonly llvmVersion: string = "20.1.6",
    private readonly llvmBuildRelease: string = "20250717-163129",
    private readonly useCloudCache: boolean = true,
    private readonly useLocalCache: boolean = false,
    private readonly buildType: BuildType = "MinSizeRel"
  ) {
    core.info(`llvm version: ${this.llvmVersion}`);
    core.info(`llvm build release: ${this.llvmBuildRelease}`);
    core.info(`useCloudCache: ${this.useCloudCache}`);
    core.info(`useLocalCache: ${this.useLocalCache}`);
  }

  public async run(): Promise<void> {
    // const targetArchPlat = shared.getArchitecturePlatform();
    // const cmakeVer = ToolsGetter.matchRange(catalog.cmakeCatalog, this.requestedCMakeVersion, "cmake");
    // if (!cmakeVer)
    //   throw Error(`Cannot match CMake version:'${this.requestedCMakeVersion}' in the catalog.`);
    // const cmakePackages = (catalog.cmakeCatalog as shared.CatalogType)[cmakeVer];
    // if (!cmakePackages)
    //   throw Error(`Cannot find CMake version:'${this.requestedCMakeVersion}' in the catalog.`);
    // const cmakePackage = cmakePackages[targetArchPlat];
    // core.debug(`cmakePackages: ${JSON.stringify(cmakePackages)}`);
    // if (!cmakePackage)
    //   throw Error(`Cannot find CMake version:'${this.requestedCMakeVersion}' in the catalog for the '${targetArchPlat}' platform.`);

    await this.get();
  }

  private async get(): Promise<void> {
    let hashedKey: number | undefined;
    let outPath: string | undefined;
    let cloudCacheHitKey: string | undefined = undefined;
    let localCacheHit = false;
    let localPath: string | undefined = undefined;

    const archiveFileName = getArchiveFileName(
      this.llvmVersion,
      process.platform,
      process.arch,
      this.buildType
    );

    await core.group(
      `Computing cache key from the downloads' URLs`,
      async () => {
        // Get an unique output directory name from the URL.
        const cacheKey = archiveFileName;
        hashedKey = hashCode(cacheKey);
        core.info(`Cache key: '${hashedKey}'.`);
        core.debug(`hash('${cacheKey}') === '${hashedKey}'`);
        outPath = this.getOutputPath(hashedKey.toString());
        core.info(`Local install root: '${outPath}''.`);
      }
    );

    assertPresent(hashedKey);
    assertPresent(outPath);

    if (this.useLocalCache) {
      await core.group(
        `Restoring from local GitHub runner cache using key '${hashedKey}'`,
        async () => {
          assertPresent(hashedKey);

          localPath = tools.find(
            ToolsGetter.LOCAL_CACHE_NAME,
            ToolsGetter.convertHashToFakeSemver(hashedKey),
            process.platform
          );
          // Silly tool-cache API does return an empty string in case of cache miss.
          localCacheHit = !!localPath;

          core.info(localCacheHit ? "Local cache hit." : "Local cache miss.");
        }
      );
    }

    if (!localCacheHit) {
      if (this.useCloudCache) {
        await core.group(
          `Restoring from GitHub cloud cache using key '${hashedKey}' into '${outPath}'`,
          async () => {
            assertPresent(outPath);
            assertPresent(hashedKey);

            cloudCacheHitKey = await this.restoreCache(outPath, hashedKey);
            core.info(
              cloudCacheHitKey === undefined
                ? "Cloud cache miss."
                : "Cloud cache hit."
            );
          }
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

    await this.addToolsToPath(localPath, archiveFileName);

    if (this.useCloudCache && cloudCacheHitKey === undefined) {
      await core.group(
        `Saving to GitHub cloud cache using key '${hashedKey}'`,
        async () => {
          assertPresent(outPath);
          assertPresent(hashedKey);

          if (localCacheHit) {
            core.info(
              "Skipping saving to cloud cache since there was local cache hit for the computed key."
            );
          } else if (cloudCacheHitKey === undefined) {
            await this.saveCache([outPath], hashedKey);
            core.info(
              `Saved '${outPath}' to the GitHub cache service with key '${hashedKey}'.`
            );
          } else {
            core.info(
              "Skipping saving to cloud cache since there was a cache hit for the computed key."
            );
          }
        }
      );
    }

    if (this.useLocalCache && !localCacheHit && localPath) {
      await core.group(
        `Saving to local cache using key '${hashedKey}' from '${outPath}'`,
        async () => {
          assertPresent(localPath);
          assertPresent(hashedKey);

          await tools.cacheDir(
            localPath,
            ToolsGetter.LOCAL_CACHE_NAME,
            ToolsGetter.convertHashToFakeSemver(hashedKey),
            process.platform
          );
          core.info(
            `Saved '${outPath}' to the local GitHub runner cache with key '${hashedKey}'.`
          );
        }
      );
    }
  }

  private static matchRange(
    theCatalog: shared.CatalogType,
    range: string
  ): string {
    core.debug(`matchRange(${theCatalog}, ${range})>>`);
    const targetArchPlat = shared.getArchitecturePlatform();
    try {
      const packages = theCatalog[range];
      if (!packages)
        throw Error(`Cannot find llvm version '${range}' in the catalog.`);
      const aPackage = packages[targetArchPlat];
      if (!aPackage)
        throw Error(
          `Cannot find 'llvm' version '${range}' in the catalog for the '${targetArchPlat}' platform.`
        );
      // return 'range' itself, this is the case where it is a well defined version.
      return range;
    } catch (error: any) {
      core.debug(error?.message);
      // Try to use the range to find the version ...
      core.debug(`Collecting semvers list... `);
      const matches: SemVer[] = [];
      Object.keys(theCatalog).forEach((release) => {
        try {
          matches.push(new SemVer(release));
        } catch {
          core.debug(`Skipping ${release}`);
        }
      });
      const match = maxSatisfying(matches, range);
      if (!match || !match.version) {
        throw new Error(
          `Cannot match '${range}' with any version in the catalog for llvm.`
        );
      }
      core.debug(`matchRange(${theCatalog}, ${range}, llvm)>>`);
      return match.version;
    }
  }

  private isWindows(): boolean {
    return process.platform === "win32";
  }

  // Some ninja archives for macOS contain the ninja executable named after
  // the package name rather than 'ninja'.

  private async addToolsToPath(
    outPath: string,
    llvmArchiveFileName: string
  ): Promise<void> {
    await core.group(`Add CMake and Ninja to PATH`, async () => {
      const llvmBinPath = path.join(
        outPath,
        llvmArchiveFileName.replace(".tar.zst", ""),
        "bin"
      );

      core.info(`LLVM bin folder: '${llvmBinPath}'`);
      core.addPath(llvmBinPath);

      await core.group(`Validating the installed LLVM paths`, async () => {
        const llvmWhichPath: string = await io.which("llvm-config", true);
        core.info(`LLVM actual path is: '${llvmWhichPath}'`);

        const clangWhichPath: string = await io.which("clang", true);
        core.info(`Clang actual path is: '${clangWhichPath}'`);
      });
    });
  }

  private getOutputPath(subDir: string): string {
    if (!process.env.RUNNER_TEMP)
      throw new Error(
        "Environment variable process.env.RUNNER_TEMP must be set, it is used as destination directory of the cache"
      );
    return path.join(process.env.RUNNER_TEMP, subDir);
  }

  private async saveCache(
    paths: string[],
    key: number
  ): Promise<number | undefined> {
    try {
      return await cache.saveCache(paths, key.toString());
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

  private restoreCache(
    outPath: string,
    key: number
  ): Promise<string | undefined> {
    return cache.restoreCache([outPath], key.toString());
  }

  private async extract(
    downloaded: string,
    outputPath: string
  ) {
    core.info("Extracting archive from " + downloaded);
    await tools.extractTar(downloaded, outputPath, `--zstd`);
  }

  // Returns the path to the downloaded file.
  private async downloadLLVM(archiveFileName: string): Promise<string> {
    const downloadUrl = `${ToolsGetter.DOWNLOAD_URL_PREFIX}/${this.llvmBuildRelease}/${archiveFileName}`;
    core.info(`Downloading LLVM from '${downloadUrl}'`);

    return await tools.downloadTool(downloadUrl);
  }

  private async downloadAndExtractLLVM(
    archiveFileName: string,
    outputPath: string
  ): Promise<void> {
    const downloaded = await this.downloadLLVM(archiveFileName);

    await this.extract(downloaded, outputPath);
  }

  private static convertHashToFakeSemver(hashedKey: number): string {
    // Since the key may be negative and needs to drop the sign to work good as
    // a major version number, let's ensure an unique version by switching the patch part.
    const minorPatch = hashedKey > 0 ? ".0.0" : ".0.1";
    return `${Math.abs(hashedKey)}${minorPatch}`;
  }
}

function forceExit(exitCode: number) {
  // work around for:
  //  - https://github.com/lukka/get-cmake/issues/136
  //  - https://github.com/nodejs/node/issues/47228

  // Avoid this workaround when running mocked unit tests.
  if (process.env.JEST_WORKER_ID) return;

  process.exit(exitCode);
}

export async function main(): Promise<void> {
  try {
    const cmakeGetter: ToolsGetter = new ToolsGetter();
    await cmakeGetter.run();
    core.info("get-cmake action execution succeeded");
    process.exitCode = 0;
    forceExit(0);
  } catch (err) {
    const error: Error = err as Error;
    if (error?.stack) {
      core.debug(error.stack);
    }
    const errorAsString = (err ?? "undefined error").toString();
    core.setFailed(`get-llvm action execution failed: '${errorAsString}'`);
    process.exitCode = -1000;

    forceExit(-1000);
  }
}
