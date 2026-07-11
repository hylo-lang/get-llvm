// Copyright (c) 2020, 2021, 2022, 2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { main } from "../src/get-llvm";
import { Fakes } from "./support/fakes";

const baseInputs = {
  llvmVersion: "20.1.6",
  llvmBuildRelease: "20250910-063105",
  addToPath: "false",
  addToPkgConfigPath: "false",
};

test("cloud/local caches, all misses: download, then save to each enabled cache", async () => {
  for (const scenario of [
    { cloudCache: true, localCache: true },
    { cloudCache: true, localCache: false },
    { cloudCache: false, localCache: true },
    { cloudCache: false, localCache: false },
  ]) {
    const ports = new Fakes(); // fresh ports per case: no mock resetting needed
    ports.core.inputs = {
      ...baseInputs,
      useCloudCache: String(scenario.cloudCache),
      useLocalCache: String(scenario.localCache),
    };
    ports.cloudCache.restoreResult = undefined; // cloud miss
    ports.localCache.findResult = null; // local miss

    await main(ports);

    expect(ports.core.failed.length).toBe(0);
    expect(ports.core.errors.length).toBe(0);
    expect(ports.downloader.calls.length).toBe(1);
    expect(ports.localCache.findCalls.length).toBe(scenario.localCache ? 1 : 0);
    expect(ports.localCache.cacheDirCalls.length).toBe(scenario.localCache ? 1 : 0);
    expect(ports.cloudCache.restoreCalls.length).toBe(scenario.cloudCache ? 1 : 0);
    expect(ports.cloudCache.saveCalls.length).toBe(scenario.cloudCache ? 1 : 0);
  }
});

test("cloud/local cache hits skip downloading and re-saving", async () => {
  for (const scenario of [
    { cloudCache: true, localCache: true, localHit: false, cloudHit: true },
    { cloudCache: false, localCache: true, localHit: false, cloudHit: false },
    { cloudCache: true, localCache: true, localHit: true, cloudHit: false },
    { cloudCache: false, localCache: true, localHit: true, cloudHit: false },
  ]) {
    const ports = new Fakes();
    ports.core.inputs = {
      ...baseInputs,
      useCloudCache: String(scenario.cloudCache),
      useLocalCache: String(scenario.localCache),
    };
    ports.localCache.findResult = scenario.localHit ? "local-hit-dir" : null;
    ports.cloudCache.restoreResult = scenario.cloudHit ? "cloud-hit-key" : undefined;

    await main(ports);

    expect(ports.core.failed.length).toBe(0);
    expect(ports.core.errors.length).toBe(0);

    // A hit in either cache means no download.
    const downloaded = !scenario.localHit && !scenario.cloudHit;
    expect(ports.downloader.calls.length).toBe(downloaded ? 1 : 0);

    expect(ports.localCache.findCalls.length).toBe(scenario.localCache ? 1 : 0);
    // Save to the local tool cache only when it is enabled and there was a miss.
    expect(ports.localCache.cacheDirCalls.length).toBe(
      scenario.localCache && !scenario.localHit ? 1 : 0,
    );

    // A local hit short-circuits before the cloud cache is consulted.
    expect(ports.cloudCache.restoreCalls.length).toBe(
      scenario.cloudCache && !scenario.localHit ? 1 : 0,
    );
    expect(ports.cloudCache.saveCalls.length).toBe(
      scenario.cloudCache && !scenario.localHit && !scenario.cloudHit ? 1 : 0,
    );
  }
});

test("local cache store then restore: download happens once", async () => {
  const ports = new Fakes(); // shared across iterations to accumulate download count
  ports.core.inputs = {
    ...baseInputs,
    useCloudCache: "false",
    useLocalCache: "true",
  };

  let expectedDownloads = 0;
  for (const localHit of [false, true]) {
    // Simulate the entry stored on the first (miss) iteration being found on the next.
    ports.localCache.findResult = localHit ? "local-hit-dir" : null;

    await main(ports);

    expect(ports.core.failed.length).toBe(0);
    expect(ports.cloudCache.restoreCalls.length).toBe(0);
    expect(ports.cloudCache.saveCalls.length).toBe(0);

    expectedDownloads += localHit ? 0 : 1;
    expect(ports.downloader.calls.length).toBe(expectedDownloads);
  }
});
