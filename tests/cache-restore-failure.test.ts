// Copyright (c) 2020, 2021, 2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { ToolsGetter } from "../src/get-llvm";
import { Fakes, options } from "./support/fakes";

test("a cloud cache restore failure rejects", async () => {
  const ports = new Fakes();
  ports.cloudCache.restoreThrows = true;

  const getter = new ToolsGetter(options({ useCloudCache: true }), ports);
  await expect(getter.run()).rejects.toThrowError();
});
