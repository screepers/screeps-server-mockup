#!/bin/bash

#
# Publish package on npm public registry if local version is newer.
# Expects $NPM_TOKEN environment variable to be set with a valid npm authentication token.
#

PACKAGE_NAME=$(cat package.json | jq --raw-output '.name')
LOCAL_VERSION=$(cat package.json | jq --raw-output '.version')
REMOTE_VERSION=$(curl -s https://registry.npmjs.org/$PACKAGE_NAME | jq --raw-output '."dist-tags".latest')

if [ "LOCAL_VERSION" = "REMOTE_VERSION" ]; then
    echo "No update detected (v$LOCAL_VERSION), nothing to do."
else
    echo "New version detected: $LOCAL_VERSION, publishing to npm..."
    npm set //registry.npmjs.org/:_authToken $NPM_TOKEN
    npm publish
fi
