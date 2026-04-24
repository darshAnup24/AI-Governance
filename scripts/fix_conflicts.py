#!/usr/bin/env python3
"""
Resolve all git merge conflict markers in a list of files.
Strategy: keep the THEIRS side (content after ======= until >>>>>>>).
"""
import sys
import re
from pathlib import Path

CONFLICT_RE = re.compile(
    r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n',
    re.DOTALL
)

def resolve_file(path: Path, keep: str = "theirs") -> int:
    text = path.read_text(encoding="utf-8")
    if "<<<<<<< HEAD" not in text:
        return 0

    count = 0
    def replacer(m):
        nonlocal count
        count += 1
        ours   = m.group(1)
        theirs = m.group(2)
        return theirs if keep == "theirs" else ours

    resolved = CONFLICT_RE.sub(replacer, text)
    path.write_text(resolved, encoding="utf-8")
    print(f"  ✅ {path} — resolved {count} conflict(s)")
    return count

def main():
    root = Path(__file__).parent.parent
    # Find all files with conflict markers, excluding common noise directories
    print("🔍 Searching for files with conflict markers...")
    
    # Use find to get the file list
    import subprocess
    try:
        output = subprocess.check_output(
            ["grep", "-l", "-r", "<<<<<<< HEAD", "."],
            cwd=str(root),
            text=True
        ).splitlines()
    except subprocess.CalledProcessError:
        output = []

    files = [f for f in output if "node_modules" not in f and ".git" not in f and ".gemini" not in f]
    
    if not files:
        print("No files with conflict markers found!")
        return

    total_resolved = 0
    for f in files:
        p = root / f
        if p.is_file():
            total_resolved += resolve_file(p)

    print(f"\nDone — {total_resolved} conflict block(s) resolved across {len(files)} files.")

if __name__ == "__main__":
    main()

