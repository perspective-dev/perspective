#!/bin/bash

set -e

sudo apt-get update

# Install cmake
test -f /usr/share/doc/kitware-archive-keyring/copyright ||
wget -O - https://apt.kitware.com/keys/kitware-archive-latest.asc 2>/dev/null | gpg --dearmor - | sudo tee /usr/share/keyrings/kitware-archive-keyring.gpg >/dev/null

echo 'deb [signed-by=/usr/share/keyrings/kitware-archive-keyring.gpg] https://apt.kitware.com/ubuntu/ jammy main' | sudo tee /etc/apt/sources.list.d/kitware.list >/dev/null
sudo apt-get update
sudo apt-get install -y kitware-archive-keyring
sudo apt-get install -y cmake

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Repo setup
pnpm install

# Install Playwright browsers with system dependencies
npx playwright install --with-deps
