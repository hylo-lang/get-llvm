// Copyright (c) 2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { main } from "../src/get-llvm";
import { Fakes } from "./support/fakes";

test("a failing run reports the failure and never saves a cache", async () => {
  const fakes = new Fakes();
  fakes.core.inputs = { useCloudCache: "true" };
  fakes.cloudCache.restoreThrows = true; // force the run to fail early

  await main(fakes);

  expect(fakes.core.failed.length).toBe(1);
  expect(fakes.core.errors.length).toBe(1);
  expect(fakes.localCache.cacheDirCalls.length).toBe(0);
  expect(fakes.env.exitCalls).toContain(-1000);
});
