# Development Container Setup

This devcontainer is configured with Node.js 20 and includes all the necessary tools for developing the get-cmake-action project.

## Features

- **Node.js 20**: Latest LTS version with npm
- **TypeScript**: Globally installed for development
- **Development Tools**: Git, GitHub CLI, build-essential
- **VS Code Extensions**: Pre-configured with essential extensions for TypeScript/JavaScript development

## Getting Started

1. Open this repository in VS Code
2. When prompted, click "Reopen in Container" or run the "Dev Containers: Reopen in Container" command
3. VS Code will build the container and install all dependencies
4. The container will automatically run `npm install` after creation

## Available Commands

After the container is running, you can use all the npm scripts defined in `package.json`:

- `npm run build` - Build the TypeScript project
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run pack` - Build and package the action

## Container Details

- **Base Image**: Node.js 20 on Debian Bullseye
- **User**: node (non-root)
- **Working Directory**: /workspace
- **Forwarded Ports**: 3000, 8080
