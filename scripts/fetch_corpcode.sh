#!/bin/bash
# Usage: ./fetch_corpcode.sh <API_KEY>
set -e
KEY="$1"
if [ -z "$KEY" ]; then
  echo "Usage: $0 <API_KEY>"
  exit 1
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
mkdir -p "$DIR"

curl -s "https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY}" -o "$DIR/corpCode.zip"

# Detect if the response is actually an error JSON/XML instead of a zip
if file "$DIR/corpCode.zip" | grep -qi "zip"; then
  unzip -o "$DIR/corpCode.zip" -d "$DIR" > /dev/null
  echo "OK: $DIR/CORPCODE.xml ready"
else
  echo "ERROR: response was not a zip file. Content:"
  cat "$DIR/corpCode.zip"
  exit 1
fi
