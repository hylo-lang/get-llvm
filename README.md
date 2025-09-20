# The **get-llvm** action installs your desired version of LLVM as fast as possible

The action restores LLVM from local or cloud cache. If a cache miss occurs, it downloads and caches the tools right away from [Hylo's LLVM Builds](https://github.com/hylo-lang/llvm-build).

- Supported OSs: `Windows`, `Linux`, `MacOS 14+`
- Supported architectures: `x86_64`, `arm64`/`aarch64`
- Supported LLVM build configurations: `MinSizeRel`, `Debug`

## Quickstart

For the definitive set of options, see [action.yml](action.yml) or the table below.

```yaml
# Option 1: using 'latest' branch, the most recent supported LLVM is installed.
- uses: hylo-lang/get-llvm@latest

# Option 2: Install a specific LLVM version
- uses: hylo-lang/get-llvm@latest
  with:
    llvmVersion: '20.1.6'
    llvmBuildRelease: '20250910-063105'

# Option 3: Install LLVM with Debug configuration
- uses: hylo-lang/get-llvm@latest
  with:
    llvmVersion: '20.1.6'
    llvmBuildRelease: '20250910-063105'
    llvmBuildConfig: 'Debug'

# Option 4: For self-hosted runners, use local cache instead of cloud cache
- uses: hylo-lang/get-llvm@latest
  with:
    useCloudCache: false
    useLocalCache: true

# Option 5: Install LLVM without adding to PATH (for custom integration)
- uses: hylo-lang/get-llvm@latest
  with:
    addToPath: false
    addToPkgConfigPath: false
  id: llvm-setup

# Then use the outputs for custom integration
- name: Use LLVM
  run: |
    echo "LLVM installed at: ${{ steps.llvm-setup.outputs.llvmRootDirectory }}"
    echo "LLVM bin directory: ${{ steps.llvm-setup.outputs.llvmBinDirectory }}"
    echo "LLVM version: ${{ steps.llvm-setup.outputs.llvmVersion }}"
    
# Option 6: Complete example with matrix strategy for multiple LLVM versions
strategy:
  matrix:
    build-config: ['MinSizeRel', 'Debug']
    
steps:
- uses: hylo-lang/get-llvm@latest
  with:
    llvmVersion: 20.1.6
    llvmBuildRelease: '20250910-063105'
    llvmBuildConfig: ${{ matrix.build-config }}
```

## Reference: Inputs and Outputs

### Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `llvmVersion` | No | `20.1.6` | LLVM version (fully qualified, e.g. 20.1.6). Must correspond to the version available in the llvmBuildRelease. |
| `llvmBuildRelease` | No | `20250910-063105` | LLVM build release tag - must correspond to the version specified in the llvmVersion. |
| `llvmBuildArchitecture` | No | *auto-detected* | LLVM build architecture. When nothing specified, the architecture of the runner is used. |
| `llvmBuildTripleSuffix` | No | *auto-detected* | The part of the archive name that indicates the operating system and the abi, e.g. 'unknown-linux-gnu', 'apple-darwin24.1.0', 'unknown-windows-msvc17'. When nothing specified, the platform of the runner is used. |
| `llvmBuildConfig` | No | `MinSizeRel` | LLVM build configuration. Supported values are: `Debug`, `MinSizeRel`. |
| `addToPath` | No | `true` | If true, adds the LLVM bin directory to the PATH environment variable. |
| `addToPkgConfigPath` | No | `true` | If true, adds the pkgconfig directory with llvm.pc to the PKG_CONFIG_PATH environment variable. |
| `useCloudCache` | No | `true` | Optional argument indicating whether to use the cloud based storage of the GitHub cache. Suited for the GitHub-hosted runners. |
| `useLocalCache` | No | `false` | Optional argument indicating whether to use the local cache on the GitHub runner file system. Suited for the self-hosted GitHub runners. |

### Outputs

| Output | Description |
|--------|-------------|
| `llvmRootDirectory` | The root directory of the installed LLVM. |
| `llvmBinDirectory` | The bin directory of the installed LLVM. |
| `llvmPkgConfigDirectory` | The pkgconfig directory containing llvm.pc of the installed LLVM. |
| `llvmLibDirectory` | The lib directory of the installed LLVM. |
| `llvmCmakeDirectory` | The cmake directory containing LLVMConfig.cmake of the installed LLVM (`<LLVM>/lib/cmake/llvm`). |
| `lldCmakeDirectory` | The cmake directory containing LLDConfig.cmake of the installed LLVM (`<LLVM>/lib/cmake/lld`). |
| `llvmVersion` | The version of the installed LLVM. |

## Caching Overview

There are two kind of caches:
- The cloud based [GitHub cache](https://www.npmjs.com/package/@actions/cache). Enabled by default, it can be disabled using the input `useCloudCache:false`. 
- The local self-hosted runner cache, stored locally using [tool-cache](https://www.npmjs.com/package/@actions/tool-cache). Disabled by default, it can enabled with the input `useLocalCache:true`. 


Steps of `get-llvm`:
  1. If a `cache-hit` occurs (either local or cloud cache), LLVM is restored from the cache.
     1. if both local and cloud are enabled, the local cache check goes first.
  2. If a `cache-miss` occurs, i.e. none of the enabled caches hit:
     1. the action downloads and installs the desired version of LLVM.
     2. the action stores LLVM for the enabled caches:
        1. if enabled, on the [cloud based GitHub cache](https://www.npmjs.com/package/@actions/cache). This is beneficial for the next run of the workflow especially on _GitHub-hosted runners_.
        2. if enabled, on the local GitHub runner cache. This is beneficial for the next run of the workflow on the same _self-hosted runner_.
        
        _Note:_ when there is a `cache-hit`, nothing will be stored in any of the caches.
  3. Adds to the `PATH` environment variable the binary directories for LLVM.
  
<br>
# Developing
## Prerequisites
Use the devcontainer for developing this action.
<br>

## Build and lint
Build with `tsc` running:

 > npm run build

Launch `lint` by:

 > npm run lint

## Packaging
To build, lint validate and package the extension (and embed the release catalog) for release purpose, run:

  > npm run pack

<br>

## Testing
To build, pack and run all tests:
 
    npm run test

 To run all tests:
 
    npx jest

 
## Contributing
The software is provided as is, there is no warranty of any kind. All users are encouraged to improve the [source code](https://github.com/hylo-lang/get-llvm) with fixes and new features.

<br>

# License
All the content in this repository is licensed under the [MIT License](LICENSE.txt).

Copyright (c) 2020-2025 Luca Cappa + Hylo Community

