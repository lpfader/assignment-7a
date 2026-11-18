#!/bin/sh
# Works from any folder (root, books/, orders/, CI): it always runs from the repo root.
set -e
cd "$(dirname "$0")"

# One combined spec for every API, written to build/swagger.json at the root.
# It is used for the Swagger docs and to generate the client.
./books/node_modules/.bin/tsoa spec -c tsoa.json

# Each API registers only its own routes, from its own tsoa.json.
(cd books && npx tsoa routes)
(cd orders && npx tsoa routes)

(cd books && npx @openapitools/openapi-generator-cli generate -i ../build/swagger.json -o ../client -g typescript-fetch)
