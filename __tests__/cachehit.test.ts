// Copyright (c) 2020, 2021, 2022 Luca Cappa

// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as os from "os";
import * as fsPromises from "fs/promises";
import { ToolsGetter } from "../src/get-llvm";
import * as cache from "@actions/cache";
import path = require("path");
import * as crypto from "crypto";

// 10 minutes
jest.setTimeout(10 * 60 * 1000);

const cacheSaveCache = jest
  .spyOn(cache, "saveCache")
  .mockImplementation(() => Promise.resolve(0));

const cacheRestoreCache = jest
  .spyOn(cache, "restoreCache")
  .mockImplementation(() => Promise.resolve("key"));

// Prevent actual filesystem access for non-existent paths after a cache hit.
jest.spyOn(fsPromises, "access").mockImplementation(() => Promise.resolve());

// Prevent running llvm-config since no LLVM binary is present.
jest
  .spyOn(ToolsGetter.prototype, "verifyLLVMConfigVersionInDirectory")
  .mockImplementation(() => Promise.resolve());

test("testing get-llvm with cache-hit", async () => {
  const testId = crypto.randomBytes(16).toString("hex");
  process.env.RUNNER_TEMP = path.join(os.tmpdir(), `${testId}`);

  const getter: ToolsGetter = new ToolsGetter(
    "20.1.6", "20250910-063105", undefined, undefined, "MinSizeRel",
    false, false, true, false
  );
  await getter.run();
  expect(cacheSaveCache).toBeCalledTimes(0);
  expect(cacheRestoreCache).toBeCalledTimes(1);
});
