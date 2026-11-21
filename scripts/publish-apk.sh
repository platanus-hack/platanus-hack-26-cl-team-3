#!/usr/bin/env bash
set -euo pipefail
tag="android-${GITHUB_SHA}"
asset=dist/capo-ar.apk

current_head() {
  gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha
}
head_sha=$(current_head)
if [[ "$head_sha" != "$GITHUB_SHA" ]]; then
  echo "A newer main revision owns the next publication."
  exit 0
fi

if draft=$(gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft); then
  if [[ "$draft" == false ]]; then
    echo "This revision is already published."
    exit 0
  fi
else
  gh release create "$tag" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --draft \
    --title "Capo AR Android build $GITHUB_RUN_NUMBER" \
    --notes "Source: https://github.com/$GITHUB_REPOSITORY/commit/$GITHUB_SHA"
fi
(cd dist && sha256sum capo-ar.apk > capo-ar.apk.sha256)
gh release upload "$tag" "$asset" "$asset.sha256" --repo "$GITHUB_REPOSITORY" --clobber
head_sha=$(current_head)
if [[ "$head_sha" == "$GITHUB_SHA" ]]; then
  gh release edit "$tag" --repo "$GITHUB_REPOSITORY" --draft=false --latest
fi
