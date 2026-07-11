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
  for (const m of [
    { cloudCache: true, localCache: true },
    { cloudCache: true, localCache: false },
    { cloudCache: false, localCache: true },
    { cloudCache: false, localCache: false },
  ]) {
    const fakes = new Fakes(); // fresh fakes per case: no mock resetting needed
    fakes.core.inputs = {
      ...baseInputs,
      useCloudCache: String(m.cloudCache),
      useLocalCache: String(m.localCache),
    };
    fakes.cloudCache.restoreResult = undefined; // cloud miss
    fakes.localCache.findResult = ""; // local miss

    await main(fakes);

    expect(fakes.core.failed.length).toBe(0);
    expect(fakes.core.errors.length).toBe(0);
    expect(fakes.downloader.calls.length).toBe(1);
    expect(fakes.localCache.findCalls.length).toBe(m.localCache ? 1 : 0);
    expect(fakes.localCache.cacheDirCalls.length).toBe(m.localCache ? 1 : 0);
    expect(fakes.cloudCache.restoreCalls.length).toBe(m.cloudCache ? 1 : 0);
    expect(fakes.cloudCache.saveCalls.length).toBe(m.cloudCache ? 1 : 0);
  }
});

test("cloud/local cache hits skip downloading and re-saving", async () => {
  for (const m of [
    { cloudCache: true, localCache: true, localHit: false, cloudHit: true },
    { cloudCache: false, localCache: true, localHit: false, cloudHit: false },
    { cloudCache: true, localCache: true, localHit: true, cloudHit: false },
    { cloudCache: false, localCache: true, localHit: true, cloudHit: false },
  ]) {
    const fakes = new Fakes();
    fakes.core.inputs = {
      ...baseInputs,
      useCloudCache: String(m.cloudCache),
      useLocalCache: String(m.localCache),
    };
    fakes.localCache.findResult = m.localHit ? "local-hit-dir" : "";
    fakes.cloudCache.restoreResult = m.cloudHit ? "cloud-hit-key" : undefined;

    await main(fakes);

    expect(fakes.core.failed.length).toBe(0);
    expect(fakes.core.errors.length).toBe(0);

    // A hit in either cache means no download.
    const downloaded = !m.localHit && !m.cloudHit;
    expect(fakes.downloader.calls.length).toBe(downloaded ? 1 : 0);

    expect(fakes.localCache.findCalls.length).toBe(m.localCache ? 1 : 0);
    // Save to the local tool cache only when it is enabled and there was a miss.
    expect(fakes.localCache.cacheDirCalls.length).toBe(m.localCache && !m.localHit ? 1 : 0);

    // A local hit short-circuits before the cloud cache is consulted.
    expect(fakes.cloudCache.restoreCalls.length).toBe(m.cloudCache && !m.localHit ? 1 : 0);
    expect(fakes.cloudCache.saveCalls.length).toBe(
      m.cloudCache && !m.localHit && !m.cloudHit ? 1 : 0,
    );
  }
});

test("local cache store then restore: download happens once", async () => {
  const fakes = new Fakes(); // shared across iterations to accumulate download count
  fakes.core.inputs = {
    ...baseInputs,
    useCloudCache: "false",
    useLocalCache: "true",
  };

  let expectedDownloads = 0;
  for (const localHit of [false, true]) {
    // Simulate the entry stored on the first (miss) iteration being found on the next.
    fakes.localCache.findResult = localHit ? "local-hit-dir" : "";

    await main(fakes);

    expect(fakes.core.failed.length).toBe(0);
    expect(fakes.cloudCache.restoreCalls.length).toBe(0);
    expect(fakes.cloudCache.saveCalls.length).toBe(0);

    expectedDownloads += localHit ? 0 : 1;
    expect(fakes.downloader.calls.length).toBe(expectedDownloads);
  }
});
