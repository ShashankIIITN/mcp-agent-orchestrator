"""CLI launcher for mcp-agent-orchestrator when installed via pip / uvx."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__


def _get_cache_root() -> Path:
    if platform.system() == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        return base / "mcp-agent-orchestrator" / "runtime-cache" / f"v{__version__}"
    xdg = os.environ.get("XDG_CACHE_HOME")
    base = Path(xdg) if xdg else (Path.home() / ".cache")
    return base / "mcp-agent-orchestrator" / "runtime-cache" / f"v{__version__}"


def _resolve_runtime_entrypoint() -> Path:
    pkg_dir = Path(__file__).resolve().parent

    # 1. Local repository checkout (editable install / dev mode)
    repo_root = pkg_dir.parent
    repo_entry = repo_root / "dist" / "index.js"
    if repo_entry.is_file() and (repo_root / "node_modules").is_dir():
        return repo_entry

    # 2. Packaged wheel/sdist bundle inside mcp_agent_orchestrator/_runtime
    bundled_runtime = pkg_dir / "_runtime"
    bundled_entry = bundled_runtime / "dist" / "index.js"
    if not bundled_entry.is_file():
        sys.stderr.write(
            "Error: mcp-agent-orchestrator runtime bundle not found. "
            "If running from source, run 'npm install && npm run build' first.\n"
        )
        sys.exit(1)

    cache_dir = _get_cache_root()
    cached_entry = cache_dir / "dist" / "index.js"
    cached_modules = cache_dir / "node_modules"

    if not cached_entry.is_file() or not cached_modules.is_dir():
        cache_dir.mkdir(parents=True, exist_ok=True)
        for item in ("dist", "package.json", "package-lock.json", "orchestrator.example.yaml"):
            src = bundled_runtime / item
            dst = cache_dir / item
            if src.is_dir():
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
            elif src.is_file():
                shutil.copy2(src, dst)

        npm_bin = shutil.which("npm.cmd" if platform.system() == "Windows" else "npm") or shutil.which("npm")
        if not npm_bin:
            sys.stderr.write(
                "Error: 'npm' is required to initialize mcp-agent-orchestrator runtime dependencies. "
                "Please install Node.js (>=20).\n"
            )
            sys.exit(1)

        # Redirect stdout to stderr during one-time dependency install so stdio MCP JSON-RPC is never polluted
        subprocess.run(
            [npm_bin, "install", "--omit=dev", "--no-audit", "--no-fund", "--silent"],
            cwd=str(cache_dir),
            stdout=sys.stderr,
            stderr=sys.stderr,
            check=True,
        )

    return cached_entry


def main() -> None:
    node_bin = shutil.which("node.exe" if platform.system() == "Windows" else "node") or shutil.which("node")
    if not node_bin:
        sys.stderr.write(
            "Error: Node.js (>=20) is required to run mcp-agent-orchestrator, but 'node' was not found on PATH.\n"
        )
        sys.exit(1)

    entrypoint = _resolve_runtime_entrypoint()
    cmd = [node_bin, str(entrypoint), *sys.argv[1:]]

    try:
        proc = subprocess.run(cmd)
        sys.exit(proc.returncode)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
