// Copyright (c) 2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { main } from "../src/get-llvm";
import { Fakes } from "./support/fakes";

test("a failing run reports the failure and never saves a cache", async () => {
  const ports = new Fakes();
  ports.core.inputs = { useCloudCache: "true" };
  ports.cloudCache.restoreThrows = true; // force the run to fail early

  await main(ports);

  expect(ports.core.failed.length).toBe(1);
  expect(ports.core.errors.length).toBe(1);
  expect(ports.localCache.cacheDirCalls.length).toBe(0);
  expect(ports.environment.exitCalls).toContain(-1000);
});
