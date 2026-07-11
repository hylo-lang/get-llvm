// Copyright (c) 2020, 2021, 2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { ToolsGetter } from "../src/get-llvm";
import { Fakes, options } from "./support/fakes";

test("a missing RUNNER_TEMP directory rejects", async () => {
  const fakes = new Fakes();
  fakes.environment.runnerTempValue = undefined;

  const getter = new ToolsGetter(options(), fakes);
  await expect(getter.run()).rejects.toThrowError();
});
