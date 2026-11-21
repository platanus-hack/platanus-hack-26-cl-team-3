"""Configure a fresh template clone using the identity of its GitHub origin."""
import argparse
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--domain", help="Full hostname, e.g. notes.berguecio.cl")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
repo = json.loads(subprocess.check_output(
    ["gh", "api", "repos/{owner}/{repo}"],
    cwd=root, text=True,
))
if not repo["private"] or repo["full_name"].lower() == "aberguecio/home-server-starter":
    parser.error("Run this in a private release checkout with its own GitHub origin.")
slug = re.sub(r"[^a-z0-9-]+", "-", repo["name"].lower()).strip("-")
domain = args.domain or f"{slug}.berguecio.cl"
label = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
if len(domain) > 253 or not re.fullmatch(rf"{label}(?:\.{label})+", domain):
    parser.error("Choose a valid lowercase hostname with --domain.")
repo_id = str(repo["id"])
if not re.fullmatch(r"[1-9][0-9]*", repo_id):
    parser.error("GitHub did not return a repository ID.")
compose = root / "docker-compose.yml"
model = compose.read_text()
if '"io.github-runners.repository-id=0"' not in model:
    parser.error("Compose is already configured. Review any changes manually.")
compose.write_text(model.replace("repository-id=0", f"repository-id={repo_id}")
                   .replace("app-0", f"app-{repo_id}").replace("starter.invalid", domain))
print(f"Configured {repo['full_name']} for https://{domain}. Review and commit docker-compose.yml.")
