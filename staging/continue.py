#!/usr/bin/env python3
"""Explicit, fenced continuation of c73ac1bc32; original workspace is mandatory."""
from run import main
from diagnostics import sanitize

if __name__ == "__main__":
    import sys
    if "--continue-workspace" not in sys.argv and not any(flag in sys.argv for flag in ("--help", "-h")):
        raise SystemExit("Use --continue-workspace with the ORIGINAL private workspace. No new attempt or credentials will be created.")
    try:
        main()
    except Exception as error:
        print("STOPPED before continuation: " + sanitize(error), file=sys.stderr)
        print("Retain the original workspace and ledger. No credential reset or destructive recovery was attempted.", file=sys.stderr)
        raise SystemExit(1)
