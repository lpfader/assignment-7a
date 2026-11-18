#!/bin/sh
# Runs from the repo root no matter where it is called from (root, books/, CI).
set -e
cd "$(dirname "$0")/books"
npx tsoa spec-and-routes
npx @openapitools/openapi-generator-cli generate -i ./build/swagger.json -o ../client -g typescript-fetch
