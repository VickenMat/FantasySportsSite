"""Format elapsed durations for display."""

import math


def _format_hours(hours: int) -> str:
    # Small decimal chunks stay below Python's integer-to-string digit limit.
    chunks = []
    while hours >= 10**9:
        hours, chunk = divmod(hours, 10**9)
        chunks.append(f"{chunk:09d}")
    chunks.append(str(hours))
    return "".join(reversed(chunks))


def format_elapsed(seconds: int | float) -> str:
    """Floor a finite, non-negative duration and format it as M:SS or H:MM:SS."""
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)):
        raise ValueError("seconds must be a finite non-negative int or float")
    if seconds < 0 or (isinstance(seconds, float) and not math.isfinite(seconds)):
        raise ValueError("seconds must be a finite non-negative int or float")

    total_minutes, remaining_seconds = divmod(math.floor(seconds), 60)
    hours, minutes = divmod(total_minutes, 60)
    if hours:
        return f"{_format_hours(hours)}:{minutes:02d}:{remaining_seconds:02d}"
    return f"{minutes}:{remaining_seconds:02d}"
