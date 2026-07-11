// Copyright (c) 2020, 2021, 2022, 2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { main } from "../src/get-llvm";
import { Fakes } from "./support/fakes";

test("a successful run reports success and never fails", async () => {
  const ports = new Fakes();
  ports.core.inputs = {
    llvmVersion: "20.1.6",
    llvmBuildRelease: "20250910-063105",
    addToPath: "false",
    addToPkgConfigPath: "false",
  };
  ports.cloudCache.restoreResult = undefined; // cloud miss -> download

  await main(ports);

  expect(ports.core.failed.length).toBe(0);
  expect(ports.core.errors.length).toBe(0);
  expect(ports.downloader.calls.length).toBe(1);
  expect(ports.core.outputs["llvmRootDirectory"]).toBeTruthy();
  expect(ports.environment.exitCalls).toContain(0);
});
