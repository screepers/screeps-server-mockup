#!/usr/bin/env bash
set -exo pipefail
fnm use
npm i -g pnpm
pnpm install
export PIPENV_VENV_IN_PROJECT=1
pipenv install --python=2
pipenv shell
