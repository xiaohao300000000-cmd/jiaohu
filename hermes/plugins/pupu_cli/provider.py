from __future__ import annotations

import os
import shlex
import subprocess
from collections.abc import Callable


def subprocess_runner(argv: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv,
        capture_output=True,
        check=False,
        shell=False,
        text=True,
        env=os.environ.copy(),
    )


def run_pupu(
    operation: str,
    arguments: list[str],
    *,
    runner: Callable[[list[str]], subprocess.CompletedProcess[str]] = subprocess_runner,
) -> str:
    cli_path = os.environ.get(
        "PUPU_CLI_PATH", "/home/pupu/providers/pupu-cli/.venv/bin/pupu"
    )
    completed = runner([cli_path, *shlex.split(operation), *arguments])
    return completed.stdout if completed.stdout else completed.stderr
