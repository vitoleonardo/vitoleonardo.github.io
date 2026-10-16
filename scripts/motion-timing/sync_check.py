"""Measure tube/page sync in a phone screen recording of the site.

usage: python3 sync_check.py recording.mov [--json out.json]

Per original frame (no resampling): page motion = phase correlation of the frame
minus tube pixels, tube motion = phase correlation of the tube mask. Flags:
  blank       tube present in both neighbours, (almost) absent in this frame
  tube_frozen page moves >= 10 px while the tube does not move at all
  tube_alone  page still (<= 1 px) while the tube moves >= 8 px
  page_jump   one-frame page step >= 60 px and > 1.6x both neighbours
Pixels are in a 374 px wide copy of the frame; multiply by 2/3 for CSS px on a
3x phone when the recording is a 748 px wide crop (the original one is).
"""
import json
import subprocess
import sys

import numpy as np

W, H = 374, 813


def frames(path):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    stamps = [float(x.strip().strip(",")) for x in probe.stdout.split() if x.strip().strip(",")]
    proc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", path, "-fps_mode", "passthrough", "-vf", f"scale={W}:{H}",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    size = W * H * 3
    for stamp in stamps:
        buffer = proc.stdout.read(size)
        if len(buffer) < size:
            break
        yield stamp, np.frombuffer(buffer, np.uint8).reshape(H, W, 3)


WINDOW = np.outer(np.hanning(H), np.hanning(W)).astype(np.float32)


def split(rgb):
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    blue = (b > 150) & (b - r > 60) & (b - g > 40)
    red = (r > 170) & (r - g > 90) & (r - b > 70)
    tube = blue | red
    gray = 0.299 * r + 0.587 * g + 0.114 * b
    page = gray.copy()
    page[tube] = np.median(gray)
    page -= page.mean()
    return page * WINDOW, tube.astype(np.float32), int(tube.sum())


def shift(a, b):
    cross = np.fft.rfft2(a) * np.conj(np.fft.rfft2(b))
    cross /= np.abs(cross) + 1e-6
    corr = np.fft.irfft2(cross, s=a.shape)
    dy, dx = np.unravel_index(np.argmax(corr), corr.shape)
    dy = dy - a.shape[0] if dy > a.shape[0] // 2 else dy
    return int(dy), float(corr.max())


def main():
    path = sys.argv[1]
    rows, previous = [], None
    for stamp, rgb in frames(path):
        page, tube, tube_px = split(rgb)
        row = {"t": round(stamp, 3), "tube_px": tube_px, "page_dy": 0, "page_peak": 1.0, "tube_dy": None}
        if previous is not None:
            row["page_dy"], row["page_peak"] = shift(page, previous[0])
            if tube_px > 400 and previous[2] > 400:
                row["tube_dy"], _ = shift(tube, previous[1])
        previous = (page, tube, tube_px)
        rows.append(row)

    flags = {"blank": [], "tube_frozen": [], "tube_alone": [], "page_jump": []}
    for k in range(1, len(rows) - 1):
        p, r, n = rows[k - 1], rows[k], rows[k + 1]
        floor = min(p["tube_px"], n["tube_px"])
        if floor > 1500 and r["tube_px"] < 0.15 * floor:
            flags["blank"].append(r["t"])
        if r["tube_dy"] is not None and r["page_peak"] >= 0.45:
            if abs(r["page_dy"]) >= 10 and r["tube_dy"] == 0:
                flags["tube_frozen"].append(r["t"])
            if abs(r["page_dy"]) <= 1 and abs(r["tube_dy"]) >= 8:
                flags["tube_alone"].append(r["t"])
    for k in range(1, len(rows) - 1):
        a, c, b = (abs(rows[j]["page_dy"]) for j in (k - 1, k, k + 1))
        if c >= 60 and c > 1.6 * max(a, b) and rows[k]["page_peak"] >= 0.45:
            flags["page_jump"].append(rows[k]["t"])

    duration = rows[-1]["t"] - rows[0]["t"] if rows else 0
    summary = {"frames": len(rows), "seconds": round(duration, 2), **{key: len(v) for key, v in flags.items()}}
    print(json.dumps({"summary": summary, "at": flags}, indent=1))
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w") as out:
            json.dump({"summary": summary, "flags": flags, "rows": rows}, out)


if __name__ == "__main__":
    main()
