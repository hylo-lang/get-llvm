// Copyright (c) 2020, 2021, 2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { ToolsGetter } from "../src/get-llvm";
import { Fakes, options } from "./support/fakes";

test("cloud cache miss: downloads then saves", async () => {
  const fakes = new Fakes();
  fakes.cloudCache.restoreResult = undefined; // cloud cache miss

  const getter = new ToolsGetter(options({ useCloudCache: true }), fakes);
  await getter.run();

  expect(fakes.cloudCache.restoreCalls.length).toBe(1);
  expect(fakes.downloader.calls.length).toBe(1);
  expect(fakes.cloudCache.saveCalls.length).toBe(1);
  expect(fakes.core.failed.length).toBe(0);
});
