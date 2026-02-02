#!/bin/sh
# Run from repo root so dist/server.js is found (handles Render using Root Directory = src)
if [ -f dist/server.js ]; then
  exec node dist/server.js
fi
if [ -f ../dist/server.js ]; then
  cd .. && exec node dist/server.js
fi
echo "Cannot find dist/server.js" >&2
exit 1
