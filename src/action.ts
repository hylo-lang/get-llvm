// Copyright (c) 2020-2021-2022-2023 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { defaultPorts } from "./adapters";
import { main } from "./get-llvm";

// Main entry point of the task: wire the production adapters into the domain.
main(defaultPorts()).catch((error) => {
  console.error("Error in main:", error);
  process.exit(1);
});
