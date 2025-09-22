#!/usr/bin/env python3
import json
import math
import os
import sys
import urllib.request
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    sys.stderr.write("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n")
    sys.exit(1)

API_ENDPOINT = f"{SUPABASE_URL.rstrip('/')}/rest/v1/platform_metrics_minute?select=bucket,live_streams,total_viewers,total_market_cap&order=bucket.asc"

REQ_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Accept": "application/json",
}

CHUNK_SIZE = 1000


def fetch_metrics():
    rows = []
    offset = 0
    while True:
        req = urllib.request.Request(API_ENDPOINT)
        range_header = f"{offset}-{offset + CHUNK_SIZE - 1}"
        req.add_header("Range", range_header)
        for key, value in REQ_HEADERS.items():
            req.add_header(key, value)

        with urllib.request.urlopen(req) as response:
            if response.status not in (200, 206):
                raise RuntimeError(f"Request failed: {response.status} {response.reason}")
            batch = json.loads(response.read().decode("utf-8"))

        if not batch:
            break

        rows.extend(batch)
        if len(batch) < CHUNK_SIZE:
            break
        offset += CHUNK_SIZE

    return rows


def downsample(rows, max_points=720):
    if len(rows) <= max_points:
        return rows
    step = math.ceil(len(rows) / max_points)
    return [row for index, row in enumerate(rows) if index % step == 0]


def build_chart(rows, output_path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    samples = downsample(rows, max_points=720)
    if not samples:
        raise RuntimeError("No samples to plot")

    times = [datetime.fromisoformat(row["bucket"].replace("Z", "+00:00")) for row in samples]
    live_streams = [row["live_streams"] for row in samples]
    total_viewers = [row["total_viewers"] for row in samples]

    fig, ax_streams = plt.subplots(figsize=(16, 9), dpi=100)

    ax_streams.plot(times, live_streams, color="#1f77b4", label="Live Streams", linewidth=1.8)
    ax_streams.set_ylabel("Live Streams", color="#1f77b4")
    ax_streams.tick_params(axis="y", labelcolor="#1f77b4")
    ax_streams.grid(True, which="major", axis="y", linestyle="--", alpha=0.4)

    ax_viewers = ax_streams.twinx()
    ax_viewers.plot(times, total_viewers, color="#ff7f0e", label="Total Viewers", linewidth=1.5)
    ax_viewers.set_ylabel("Total Viewers", color="#ff7f0e")
    ax_viewers.tick_params(axis="y", labelcolor="#ff7f0e")

    start_label = times[0].strftime("%Y-%m-%d %H:%M UTC")
    end_label = times[-1].strftime("%Y-%m-%d %H:%M UTC")
    title = f"Pumpstreams Platform Metrics ({start_label} → {end_label})"
    fig.suptitle(title, fontsize=18, fontweight="bold")

    ax_streams.set_xlabel("Timestamp (UTC)")
    ax_streams.xaxis.set_major_locator(mdates.AutoDateLocator())
    ax_streams.xaxis.set_major_formatter(mdates.ConciseDateFormatter(ax_streams.xaxis.get_major_locator()))

    lines_streams, labels_streams = ax_streams.get_legend_handles_labels()
    lines_viewers, labels_viewers = ax_viewers.get_legend_handles_labels()
    ax_streams.legend(lines_streams + lines_viewers, labels_streams + labels_viewers, loc="upper left")

    fig.tight_layout(rect=[0, 0.02, 1, 0.96])
    fig.savefig(output_path, format="png", facecolor="white")
    plt.close(fig)


def main():
    rows = fetch_metrics()
    if not rows:
        raise RuntimeError("No data returned from Supabase")

    output_dir = os.path.join(os.path.dirname(__file__), "..", "dashboard", "public", "charts")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "platform-metrics.png")

    build_chart(rows, output_path)
    print(f"Chart written to {output_path}")


if __name__ == "__main__":
    main()
