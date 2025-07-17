# Use the official Node.js 20 image
FROM node:20-bullseye

# Install additional tools that might be useful for development
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Install global npm packages that are commonly used
RUN npm install -g \
    typescript \
    ts-node \
    npm@11.4.2 \
    nodemon \
    @types/node

# Create a non-root user
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Configure the user
RUN groupmod --gid $USER_GID $USERNAME \
    && usermod --uid $USER_UID --gid $USER_GID $USERNAME \
    && chown -R $USER_UID:$USER_GID /home/$USERNAME

# Set the working directory
WORKDIR /workspace

# Switch to non-root user
USER $USERNAME

# Set default shell
ENV SHELL /bin/bash
