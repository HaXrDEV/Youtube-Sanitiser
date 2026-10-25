#!/bin/sh
# Builds the extension ZIP from the files it loads. checks.yml lints it for
# Firefox, and tests/package.test.js checks this list against the files the
# manifest loads
set -e

zip -r youtube-sanitiser.zip \
  manifest.json \
  defaults.js \
  view-count.js \
  content.js \
  popup.html \
  popup.css \
  popup.js \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png
