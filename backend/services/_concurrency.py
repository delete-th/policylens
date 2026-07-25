"""Shared helper for running independent per-item work (LLM calls with no
data dependency on each other) concurrently instead of one-at-a-time.
"""

from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from typing import TypeVar

T = TypeVar("T")
R = TypeVar("R")


def run_parallel(fn: Callable[[T], R], items: Iterable[T], max_workers: int) -> list[R]:
    """Runs fn(item) for each item using a thread pool. Order-preserving —
    callers that zip results back against the input list depend on this."""
    items = list(items)
    if not items:
        return []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(executor.map(fn, items))
