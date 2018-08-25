#!/bin/bash

#
# Publish package on npm public registry if local version is newer.
#  - Expects $NPM_TOKEN environment variable to be set with a valid npm authentication token.
#  - Expects npm to already be installed
#  - Tested only on Debian and CentOS based systems.
#

# Check if sudo is required (on some systems, sudo is not even installed)
if [ "$(whoami)" == "root" ]; then
    sudo=''
else
    sudo='sudo'
fi

# Ensure that required packages are installed
if [ -n "$(which yum)" ]; then
    echo "Installing packages using yum..."
    $sudo yum install -y --quiet curl jq
elif [ -n "$(which apt-get)" ]; then
    echo "Installing packages using apt-get..."
    $sudo apt-get update
    $sudo apt-get install --yes --quiet curl jq
else
    echo "No packet manager found, cannot install dependencies automatically."
fi
echo ""

# Read package name
PACKAGE_NAME=$(cat package.json | jq --raw-output '.name')
echo "Checking version for package $PACKAGE_NAME:"

# Read local version
LOCAL_VERSION=$(cat package.json | jq --raw-output '.version')
echo " - Local version is $LOCAL_VERSION."

# Read npm registry version
REMOTE_VERSION=$(curl -s https://registry.npmjs.org/$PACKAGE_NAME | jq --raw-output '."dist-tags".latest')
echo " - Registry version is $REMOTE_VERSION."

# Update if needed
if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
    echo "No update needed, nothing to do."
else
    echo "New version, publishing to npm..."
    npm set //registry.npmjs.org/:_authToken $NPM_TOKEN
    npm publish
fi
