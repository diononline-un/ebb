#!/usr/bin/env python3
"""Create GitHub issues from docs/specs: one epic issue per file, one sub-issue per package.

Usage:
  python3 scripts/specs-to-issues.py            # dry run: list what would be created
  python3 scripts/specs-to-issues.py --repo OWNER/NAME --create

Idempotent: an issue whose title already exists in the repo is skipped (matched by the
"E1-P3 · ..." / "Epic E1 · ..." prefix). Needs the gh CLI, logged in.
"""
import argparse, json, pathlib, re, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPECS = ROOT / "docs" / "specs"
READY = {"E1", "E2"}  # epics written to execution detail; the rest gets refined first
PKG = re.compile(r"^### (E\d+-P\d+) · (.+)$", re.M)
EXEC = re.compile(r"\*\*Ausführung:\*\*\s*(Kern|DeepSeek)")


def parse():
    epics = []
    for f in sorted(SPECS.glob("E*.md")):
        text = f.read_text()
        title = text.splitlines()[0].lstrip("# ").strip()
        epic_id = title.split(" ")[0]
        heads = list(PKG.finditer(text))
        intro = text[: heads[0].start()] if heads else text
        pkgs = []
        for i, m in enumerate(heads):
            body = text[m.start(): heads[i + 1].start() if i + 1 < len(heads) else len(text)]
            ex = EXEC.search(body)
            if not ex:
                sys.exit(f"{f.name}: {m.group(1)} has no Ausführung line")
            pkgs.append({"id": m.group(1), "title": m.group(2).strip(), "exec": ex.group(1).lower(), "body": body.strip()})
        epics.append({"id": epic_id, "title": title, "file": f.name, "intro": intro.strip(), "pkgs": pkgs})
    return epics


def gh(*args, input=None):
    r = subprocess.run(["gh", *args], input=input, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"gh {' '.join(args[:3])}… failed: {r.stderr.strip()}")
    return r.stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo")
    ap.add_argument("--create", action="store_true")
    a = ap.parse_args()
    epics = parse()
    total = sum(len(e["pkgs"]) for e in epics)
    for e in epics:
        kern = sum(p["exec"] == "kern" for p in e["pkgs"])
        print(f"{e['id']:4} {len(e['pkgs']):2} Pakete ({kern} Kern) · {e['title']}")
    print(f"gesamt: {len(epics)} Epics, {total} Pakete")
    if not a.create:
        return
    if not a.repo:
        sys.exit("--create braucht --repo OWNER/NAME")
    repo = a.repo
    labels = {"epic": "5A6569", "paket": "1D6B62", "exec:kern": "1F2A2E", "exec:deepseek": "6FC2B4",
              "ready": "2F6B3A", "needs-refinement": "8A5A00"}
    labels.update({f"epic:{e['id']}": "ECE9E3" for e in epics})
    for name, color in labels.items():
        subprocess.run(["gh", "label", "create", name, "--repo", repo, "--color", color, "--force"], capture_output=True)
    existing = {i["title"]: i["number"] for i in json.loads(gh("issue", "list", "--repo", repo, "--state", "all", "--limit", "500", "--json", "number,title"))}
    head = (ROOT / "AGENTS.md").read_text().split("## Startprompt-Kopf für jedes Paket (DeepSeek-Harness)")[1].split("## Prüfung")[0].strip()

    def create(title, body, lbls):
        if title in existing:
            num = existing[title]
            print(f"skip (exists) #{num} {title}")
        else:
            url = gh("issue", "create", "--repo", repo, "--title", title, "--body-file", "-", *sum((["--label", l] for l in lbls), []), input=body).strip()
            num = int(url.rsplit("/", 1)[1])
            print(f"created #{num} {title}")
            time.sleep(1.5)  # stay under GitHub's secondary rate limit for content creation
        node = json.loads(gh("api", f"repos/{repo}/issues/{num}"))
        return {"number": num, "id": node["id"]}

    for e in epics:
        state = "ready" if e["id"] in READY else "needs-refinement"
        epic = create(f"Epic {e['title']}", f"{e['intro']}\n\nQuelle: `docs/specs/{e['file']}`", ["epic", f"epic:{e['id']}", state])
        for p in e["pkgs"]:
            body = f"{head}\n\n---\n\n{p['body']}\n\n---\nEpic: #{epic['number']} · Quelle: `docs/specs/{e['file']}`"
            issue = create(f"{p['id']} · {p['title']}", body, ["paket", f"epic:{e['id']}", f"exec:{p['exec']}", state])
            # link as sub-issue (REST sub-issues API needs the numeric id, not the number)
            subprocess.run(["gh", "api", "-X", "POST", f"repos/{repo}/issues/{epic['number']}/sub_issues",
                            "-F", f"sub_issue_id={issue['id']}"], capture_output=True)


if __name__ == "__main__":
    main()
