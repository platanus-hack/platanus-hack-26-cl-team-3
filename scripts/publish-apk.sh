#!/usr/bin/env bash
set -euo pipefail
case "${GITHUB_REF_NAME}" in
  main) tag="android-${GITHUB_SHA}"; release_flags=(--latest) ;;
  dev) tag="android-dev-${GITHUB_SHA}"; release_flags=(--prerelease --latest=false) ;;
  *) echo "Unsupported release branch: ${GITHUB_REF_NAME}" >&2; exit 1 ;;
esac
asset=dist/capo-ar.apk
download="https://github.com/$GITHUB_REPOSITORY/releases/download/$tag/capo-ar.apk"

can_publish() {
  if [[ "$GITHUB_REF_NAME" == dev ]]; then
    return 0
  fi
  local head_sha
  head_sha=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq .object.sha) || exit 1
  [[ "$head_sha" == "$GITHUB_SHA" ]]
}
if ! can_publish; then
  echo "A newer main revision owns the next publication."
  exit 0
fi

if draft=$(gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft); then
  if [[ "$draft" == false ]]; then
    echo "This revision is already published."
    echo "[Download APK]($download)" >> "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
else
  gh release create "$tag" --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --draft \
    --title "Capo AR Android $GITHUB_REF_NAME build $GITHUB_RUN_NUMBER" \
    --notes "Source: https://github.com/$GITHUB_REPOSITORY/commit/$GITHUB_SHA"
fi
(cd dist && sha256sum capo-ar.apk > capo-ar.apk.sha256)
gh release upload "$tag" "$asset" "$asset.sha256" --repo "$GITHUB_REPOSITORY" --clobber
if can_publish; then
  gh release edit "$tag" --repo "$GITHUB_REPOSITORY" --draft=false "${release_flags[@]}"
  echo "[Download APK]($download)" >> "$GITHUB_STEP_SUMMARY"
fi
