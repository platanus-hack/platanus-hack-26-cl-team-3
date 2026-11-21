#!/usr/bin/env bash
set -euo pipefail

port=$(docker compose config --format json | jq -er '
  .services.web.labels | .["io.github-runners.repository-id"] as $id |
  .["traefik.http.services.app-" + $id + ".loadbalancer.server.port"]')
[[ "$port" =~ ^[1-9][0-9]{0,4}$ && "$port" -le 65535 ]]

docker build --label "org.opencontainers.image.revision=$GITHUB_SHA" \
  --label "org.opencontainers.image.source=$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" -t candidate .
container=$(docker run -d -p "127.0.0.1::${port}" candidate)
trap 'docker rm -f "$container" >/dev/null' EXIT

for _ in {1..30}; do
  case "$(docker inspect -f '{{.State.Health.Status}}' "$container")" in
    healthy) break ;;
    unhealthy) docker logs "$container"; exit 1 ;;
  esac
  sleep 2
done
[[ $(docker inspect -f '{{.State.Health.Status}}' "$container") == healthy ]]
url="http://$(docker port "$container" "$port/tcp")"
curl -fsS "$url/" | grep -F 'rel="manifest"' >/dev/null
curl -fsS "$url/manifest.webmanifest" | jq -e '.display == "standalone" and .start_url == "/"'
curl -fsSI "$url/manifest.webmanifest" | grep -Ei '^content-type: application/manifest\+json'
curl -fsSI "$url/sw.js" | grep -Ei '^content-type: application/javascript'
curl -fsS "$url/sw.js" | grep -E "const CACHE = 'capo-ar-shell-[a-f0-9]{64}';" >/dev/null
for asset in app.js styles.css icon-192.png icon-512.png; do
  curl -fsS -o /dev/null "$url/$asset"
done

if [[ -f prototype/vehicle-maps/index.html ]]; then
  curl -fsSI -o /dev/null "$url/maps/index.html"
  for asset in index.html viewer.css viewer.js vehicles.js; do
    curl -fsS -o /dev/null "$url/maps/$asset"
  done
fi
