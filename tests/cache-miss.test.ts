// Copyright (c) 2020, 2021, 2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { ToolsGetter } from "../src/get-llvm";
import { Fakes, options } from "./support/fakes";

test("cloud cache miss: downloads then saves", async () => {
  const ports = new Fakes();
  ports.cloudCache.restoreResult = undefined; // cloud cache miss

  const getter = new ToolsGetter(options({ useCloudCache: true }), ports);
  await getter.run();

  expect(ports.cloudCache.restoreCalls.length).toBe(1);
  expect(ports.downloader.calls.length).toBe(1);
  expect(ports.cloudCache.saveCalls.length).toBe(1);
  expect(ports.core.failed.length).toBe(0);
});
