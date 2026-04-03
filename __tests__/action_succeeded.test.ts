// Copyright (c) 2020, 2021, 2022, 2024 Luca Cappa

// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as os from "os";
import * as fsPromises from "fs/promises";
import * as getcmake from "../src/get-llvm";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { InputOptions } from "@actions/core";
import { ToolsGetter } from "../src/get-llvm";

// 30 minutes
jest.setTimeout(30 * 60 * 1000);

jest.spyOn(cache, "saveCache").mockImplementation(() => Promise.resolve(0));

jest
  .spyOn(cache, "restoreCache")
  .mockImplementation(() => Promise.resolve(undefined));

jest
  .spyOn(core, "getInput")
  .mockImplementation(
    (arg: string, options: InputOptions | undefined): string => {
      if (arg === "llvmVersion")
        return process.env["CUSTOM_LLVM_VERSION"] || "20.1.6";
      if (arg === "llvmBuildRelease")
        return "20250910-063105";
      if (arg === "addToPath")
        return "false";
      if (arg === "addToPkgConfigPath")
        return "false";
      return "";
    }
  );

// Prevent actual LLVM download — tests action control flow and error handling only.
jest
  .spyOn(ToolsGetter.prototype as any, "downloadAndExtractLLVM")
  .mockImplementation(() => Promise.resolve());

// Prevent actual filesystem access for non-existent paths after a mock download.
jest.spyOn(fsPromises, "access").mockImplementation(() => Promise.resolve());

// Prevent running llvm-config since no LLVM binary is present.
jest
  .spyOn(ToolsGetter.prototype, "verifyLLVMConfigVersionInDirectory")
  .mockImplementation(() => Promise.resolve());

var coreSetFailed = jest.spyOn(core, "setFailed");
var coreError = jest.spyOn(core, "error");

test("testing get-llvm action success with default llvm version", async () => {
  process.env.RUNNER_TEMP = os.tmpdir();
  delete process.env.CUSTOM_LLVM_VERSION;
  await getcmake.main();
  expect(coreSetFailed).toBeCalledTimes(0);
  expect(coreError).toBeCalledTimes(0);
});
