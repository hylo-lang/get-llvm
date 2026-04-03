// Copyright (c) 2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as os from "os";
import * as fssync from "fs";
import * as fsPromises from "fs/promises";
import * as crypto from "crypto";
import * as toolcache from "@actions/tool-cache";
import * as core from "@actions/core";
import * as path from "path";
import { main, ToolsGetter } from "../src/get-llvm";

// 30 minutes
jest.setTimeout(30 * 60 * 1000);

const localCacheInput = "__TEST__USE_LOCAL_CACHE";
const cloudCacheInput = "__TEST__USE_CLOUD_CACHE";
const localCacheHit = "__TEST__LOCAL_CACHE_HIT";
const cloudCacheHit = "__TEST__CLOUD_CACHE_HIT";

let restoreCache = jest
  .spyOn(ToolsGetter.prototype as any, "restoreCache")
  .mockResolvedValue(undefined);
let saveCache = jest
  .spyOn(ToolsGetter.prototype as any, "saveCache")
  .mockResolvedValue(0);

jest
  .spyOn(core, "getInput")
  .mockImplementation(
    (arg: string, options: core.InputOptions | undefined): string => {
      if (arg === "llvmVersion")
        return process.env["CUSTOM_LLVM_VERSION"] || "20.1.6";
      if (arg === "llvmBuildRelease")
        return "20250910-063105";
      if (arg === "addToPath")
        return "false";
      if (arg === "addToPkgConfigPath")
        return "false";
      if (arg === "useLocalCache")
        return process.env[localCacheInput] || "false";
      if (arg === "useCloudCache")
        return process.env[cloudCacheInput] || "false";
      return "";
    }
  );

// Prevent actual filesystem access for non-existent paths.
jest.spyOn(fsPromises, "access").mockImplementation(() => Promise.resolve());

// Prevent running llvm-config since no LLVM binary is present by default.
jest
  .spyOn(ToolsGetter.prototype, "verifyLLVMConfigVersionInDirectory")
  .mockImplementation(() => Promise.resolve());

// Prevent actual LLVM downloads by default; tests 1 & 2 verify cache control flow only.
// Test 3 overrides this mock to create fake directories for real local-cache store/restore.
jest
  .spyOn(ToolsGetter.prototype as any, "downloadAndExtractLLVM")
  .mockImplementation(() => Promise.resolve());

var coreSetFailed = jest.spyOn(core, "setFailed");
var coreError = jest.spyOn(core, "error");
var toolsCacheDir = jest
  .spyOn(toolcache, "cacheDir")
  .mockResolvedValue("mock-cache-dir");
var toolsFind = jest.spyOn(toolcache, "find").mockReturnValue("");

test("testing get-llvm action success with cloud/local cache enabled", async () => {
  const testId = crypto.randomBytes(16).toString("hex");
  process.env.RUNNER_TEMP = path.join(os.tmpdir(), `${testId}`);
  process.env.RUNNER_TOOL_CACHE = path.join(os.tmpdir(), `${testId}-cache`);

  for (var matrix of [
    { version: "20.1.6", cloudCache: "true", localCache: "true" },
    { version: "20.1.6", cloudCache: "true", localCache: "false" },
    { version: "20.1.6", cloudCache: "false", localCache: "true" },
    { version: "20.1.6", cloudCache: "false", localCache: "false" },
  ]) {
    console.log(`\n\ntesting for: ${JSON.stringify(matrix)}:\n`);

    process.env["CUSTOM_LLVM_VERSION"] = matrix.version;
    process.env[localCacheInput] = matrix.localCache;
    process.env[cloudCacheInput] = matrix.cloudCache;
    await main();
    expect(coreSetFailed).toBeCalledTimes(0);
    expect(coreError).toBeCalledTimes(0);
    expect(toolsCacheDir).toBeCalledTimes(matrix.localCache === "true" ? 1 : 0);
    const toolsFindInvocationCount = matrix.localCache === "true" ? 1 : 0;
    expect(toolsFind).toBeCalledTimes(toolsFindInvocationCount);
    expect(saveCache).toBeCalledTimes(matrix.cloudCache === "true" ? 1 : 0);
    expect(restoreCache).toBeCalledTimes(matrix.cloudCache === "true" ? 1 : 0);

    saveCache.mockReset();
    restoreCache.mockReset();
    toolsCacheDir.mockReset();
    toolsFind.mockReset();
  }
});

test("testing get-llvm action success with local or cloud cache hits", async () => {
  const testId = crypto.randomBytes(16).toString("hex");
  process.env.RUNNER_TEMP = path.join(os.tmpdir(), `${testId}`);
  process.env.RUNNER_TOOL_CACHE = path.join(os.tmpdir(), `${testId}-cache`);

  for (var matrix of [
    {
      version: "20.1.6",
      cloudCache: true,
      localCache: true,
      localHit: false,
      cloudHit: true,
    },
    {
      version: "20.1.6",
      cloudCache: false,
      localCache: true,
      localHit: false,
      cloudHit: false,
    },
    {
      version: "20.1.6",
      cloudCache: true,
      localCache: true,
      localHit: true,
      cloudHit: false,
    },
    {
      version: "20.1.6",
      cloudCache: false,
      localCache: true,
      localHit: true,
      cloudHit: false,
    },
  ]) {
    saveCache.mockReset().mockResolvedValue(0);
    restoreCache.mockReset().mockImplementation(async () => {
      return Promise.resolve(
        process.env[cloudCacheHit] === "true" ? "hit" : undefined
      );
    });
    toolsCacheDir.mockReset().mockResolvedValue("mock");
    toolsFind
      .mockReset()
      .mockImplementation(
        (
          toolName: string,
          versionSpec: string,
          arch?: string | undefined
        ): string => {
          return process.env[localCacheHit] === "true" ? "hit" : "";
        }
      );

    console.log(`\n\ntesting for: ${JSON.stringify(matrix)}:\n`);
    process.env["CUSTOM_LLVM_VERSION"] = matrix.version;
    process.env[localCacheInput] = String(matrix.localCache);
    process.env[cloudCacheInput] = String(matrix.cloudCache);
    process.env[localCacheHit] = String(matrix.localHit);
    process.env[cloudCacheHit] = String(matrix.cloudHit);
    await main();
    expect(coreSetFailed).toBeCalledTimes(0);
    expect(coreError).toBeCalledTimes(0);
    const toolsFindInvocationCount = matrix.localCache ? 1 : 0;
    expect(toolsFind).toBeCalledTimes(toolsFindInvocationCount);
    const toolsCacheDirInvocationCount: number =
      !matrix.localCache || matrix.localHit ? 0 : 1;
    expect(toolsCacheDir).toBeCalledTimes(toolsCacheDirInvocationCount);
    expect(toolsFind).toHaveNthReturnedWith(1, matrix.localHit ? "hit" : "");
    expect(saveCache).toBeCalledTimes(
      matrix.cloudHit || !matrix.cloudCache || matrix.localHit ? 0 : 1
    );
    expect(restoreCache).toBeCalledTimes(
      matrix.localHit || !matrix.cloudCache ? 0 : 1
    );
  }
});

test("testing get-llvm action store and restore local cache", async () => {
  toolsCacheDir.mockRestore();
  toolsFind.mockRestore();

  const testId = crypto.randomBytes(16).toString("hex");
  process.env.RUNNER_TEMP = path.join(os.tmpdir(), `${testId}`);
  process.env.RUNNER_TOOL_CACHE = path.join(os.tmpdir(), `${testId}-cache`);
  process.env[cloudCacheInput] = "false";
  process.env[localCacheInput] = "true";
  process.env["CUSTOM_LLVM_VERSION"] = "20.1.6";

  // Override the download mock to create a realistic fake directory tree so that
  // toolcache.cacheDir (which actually copies the directory) has something to work with.
  const downloadMockImpl = jest
    .spyOn(ToolsGetter.prototype as any, "downloadAndExtractLLVM")
    .mockImplementation(
      async (_archiveFileName: any, _outputPath: any) => {
        const fakeRoot = path.join(
          _outputPath,
          _archiveFileName.replace(".tar.zst", "")
        );
        fssync.mkdirSync(path.join(fakeRoot, "bin"), { recursive: true });
        fssync.mkdirSync(
          path.join(fakeRoot, "lib", "cmake", "llvm"),
          { recursive: true }
        );
        fssync.mkdirSync(
          path.join(fakeRoot, "lib", "cmake", "lld"),
          { recursive: true }
        );
        fssync.mkdirSync(path.join(fakeRoot, "pkgconfig"), { recursive: true });
      }
    );

  let downloadCallCount = 0;

  for (var matrix of [
    {
      version: "20.1.6",
      cloudCache: false,
      localCache: true,
      localHit: false,
      cloudHit: false,
    },
    {
      version: "20.1.6",
      cloudCache: false,
      localCache: true,
      localHit: true,
      cloudHit: false,
    },
  ]) {
    console.log(`\n\ntesting for: ${JSON.stringify(matrix)}:\n`);
    await main();
    expect(coreSetFailed).toBeCalledTimes(0);
    expect(coreError).toBeCalledTimes(0);
    expect(saveCache).toBeCalledTimes(0);
    expect(restoreCache).toBeCalledTimes(0);
    // The download should happen once (first iteration) and not again (local cache hit).
    downloadCallCount += matrix.localHit ? 0 : 1;
    expect(downloadMockImpl).toBeCalledTimes(downloadCallCount);
  }
});
