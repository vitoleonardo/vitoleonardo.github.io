import argparse
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

STEP = 1 / 240
STOP_SECONDS = 0.88
MORPH_SHARE = 0.62
STOP_GROUND_SHARE = 0.3
TEACHING_GROUND_SHARE = 0.4
INK_IN_SHARE = 0.42
INK_OUT_SHARE = 0.45
LINE_GROW = 0.3
INDEX_MORPH = (0.5, 0.8)
ABOUT_MORPH = 0.3
SAY_HI_MORPH = 0.5
STOP_REST_SHARE = 0.67 / STOP_SECONDS
SCENES = [
    ("hero", 1.9, 1.6),
    ("index", 1.8, 1.5),
    *[(f"stop-{k}", STOP_SECONDS, 1.0) for k in range(1, 8)],
    ("about", 1.6, 1.5),
    ("say-hi", 2.4, 1.5),
]
VIDEO_ANCHORS = {"hero": 1.6, "index": 3.0, "stop-1": 4.8, "about": 11.0, "say-hi": 12.6}
LOAD_SECONDS = 1.6
VIDEO_SECONDS = 15.0
TOTAL_SCROLL = sum(scene[2] for scene in SCENES)
REFERENCE_SPEED = TOTAL_SCROLL / (VIDEO_SECONDS - LOAD_SECONDS)
SCRUB_LAG = 0.65 / (10 * np.log(2))
SNAP_SECONDS = (0.5, 0.95)
POINTS = 520
WAVE_GAIN, WAVE_SPREAD = 1.5, 0.5
WAVE_OFFSETS = WAVE_SPREAD * np.arange(POINTS) / (POINTS - 1)
THRESHOLD = 0.1


def clamp01(x):
    return np.clip(x, 0, 1)


def between(x, a, b):
    return clamp01((x - a) / (b - a))


def sine_in_out(x):
    return 0.5 - 0.5 * np.cos(np.pi * clamp01(x))


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def quart_out(x):
    return 1 - (1 - clamp01(x)) ** 4


def morph_progress(morph):
    local = clamp01(np.atleast_1d(morph)[:, None] * WAVE_GAIN - WAVE_OFFSETS[None, :])
    return sine_in_out(local).mean(axis=1)


SITE_BEATS = {
    "sun fall": ("hero", lambda s: between(s, 0, 0.75) ** 2),
    "line grows": ("hero", lambda s: quart_out(between(s, 0.75, 0.75 + LINE_GROW))),
    "index morph": ("index", lambda s: morph_progress(between(s, *INDEX_MORPH))),
    "stop morph": ("stop-1", lambda s: morph_progress(between(s / STOP_SECONDS, 0, MORPH_SHARE))),
    "stop ground": ("stop-1", lambda s: smooth(between(s / STOP_SECONDS, 0, STOP_GROUND_SHARE))),
    "red ink in": ("stop-6", lambda s: sine_in_out(between(s / STOP_SECONDS, 0, INK_IN_SHARE))),
    "red ink out": ("stop-7", lambda s: sine_in_out(between(s / STOP_SECONDS, 0, INK_OUT_SHARE))),
    "teaching ground": ("stop-7", lambda s: smooth(between(s / STOP_SECONDS, 0, TEACHING_GROUND_SHARE))),
    "night morph": ("about", lambda s: morph_progress(between(s, 0, ABOUT_MORPH))),
    "say hi morph": ("say-hi", lambda s: morph_progress(between(s, 0, SAY_HI_MORPH))),
}


def scene(name):
    return next(item for item in SCENES if item[0] == name)


def playback_rate(name):
    _, seconds, scroll = scene(name)
    return seconds / scroll * REFERENCE_SPEED


def lagged(values, tau):
    alpha = 1 - np.exp(-STEP / tau)
    out, level = np.empty_like(values), values[0]
    for i, value in enumerate(values):
        level += (value - level) * alpha
        out[i] = level
    return out


def steady_scroll(name, progress):
    _, seconds, _ = scene(name)
    rate = playback_rate(name)
    t = np.arange(0, seconds / rate + 0.6, STEP)
    curve = lagged(progress(t * rate), SCRUB_LAG)
    return t, np.abs(np.gradient(curve, STEP))


def snap_glide(progress):
    duration = min(SNAP_SECONDS[1], max(SNAP_SECONDS[0], SNAP_SECONDS[0] + 0.5))
    t = np.arange(0, duration + 0.6, STEP)
    share = STOP_REST_SHARE + sine_in_out(t / duration) - 1.0
    curve = np.where(share >= 0, progress(np.clip(share, 0, None) * STOP_SECONDS), 0.0)
    curve = lagged(curve, SCRUB_LAG)
    return t, np.abs(np.gradient(curve, STEP))


def stats(t, v):
    above = np.where(v > THRESHOLD * v.max())[0]
    first, last = above[0], above[-1]
    peak = int(np.argmax(v))
    return {
        "onset": round(float(t[first]), 3),
        "settle": round(float(t[last]), 3),
        "duration": round(float(t[last] - t[first]), 3),
        "peak_at": round(float((t[peak] - t[first]) / max(1e-9, t[last] - t[first])), 2),
    }


def window(times, values, start, end):
    mask = (times >= start - 1e-6) & (times <= end + 1e-6)
    return times[mask], np.clip(values[mask], 0, None)


def video_curves(data):
    series = data["series"]
    fps = data["fps"]
    t = np.array(series["t"])
    tube = np.array(series["tube"], dtype=float)
    ground = np.array(series["ground"], dtype=float)
    red = np.array(series["red_area"], dtype=float)
    area = np.array(series["tube_area"], dtype=float)
    sun = np.array([np.nan if y is None else y for y in series["sun_y"]], dtype=float)
    sun_speed = np.abs(np.gradient(np.nan_to_num(sun, nan=np.nanmax(sun)), 1 / fps))
    sun_speed[(t < 1.5) | (t > 2.4)] = 0
    stop_onsets = [beat["onset_s"] for beat in data["tube"] if 4.5 < beat["onset_s"] < 10.9]
    grid = np.arange(-0.2, 0.65, 1 / fps)
    stack, per_stop = [], []
    for onset in stop_onsets:
        tt, vv = window(t, tube, onset - 0.2, onset + 0.65)
        stack.append(np.interp(grid + onset, tt, vv / vv.max()))
        per_stop.append(stats(tt, vv))
    return {
        "sun fall": window(t, sun_speed, 1.5, 2.45),
        "line grows": window(t, np.clip(np.gradient(area, 1 / fps), 0, None), 2.3, 2.9),
        "index morph": window(t, tube, 3.3, 4.1),
        "stop morph": (grid, np.mean(stack, axis=0)),
        "stop ground": window(t, ground, 7.45, 8.0),
        "red ink in": window(t, np.clip(np.gradient(red, 1 / fps), 0, None), 9.25, 10.0),
        "red ink out": window(t, np.clip(-np.gradient(red, 1 / fps), 0, None), 10.15, 10.9),
        "teaching ground": window(t, ground, 10.05, 10.75),
        "night morph": window(t, tube, 10.9, 11.8),
        "say hi morph": window(t, tube, 12.6, 13.7),
    }, per_stop, stop_onsets


def schedule():
    hero, index = VIDEO_ANCHORS["hero"], VIDEO_ANCHORS["index"]
    events = [("sun fall", hero, hero + 0.75), ("line grows", hero + 0.75, hero + 0.75 + LINE_GROW), ("index morph", index + INDEX_MORPH[0], index + INDEX_MORPH[1])]
    for k in range(7):
        start = VIDEO_ANCHORS["stop-1"] + k * STOP_SECONDS
        events.append((f"stop {k + 1}", start, start + MORPH_SHARE * STOP_SECONDS))
    about, say_hi = VIDEO_ANCHORS["about"], VIDEO_ANCHORS["say-hi"]
    events += [("night morph", about, about + ABOUT_MORPH), ("say hi morph", say_hi, say_hi + SAY_HI_MORPH)]
    return events


def plot_timeline(data, path):
    series = data["series"]
    t = np.array(series["t"])
    figure, axes = plt.subplots(4, 1, figsize=(18, 10), sharex=True)
    tube = np.array(series["tube"], dtype=float)
    axes[0].plot(t, tube / tube.max(), color="#2a4bff", lw=1.2, label="video: tube motion (optical flow minus ripple floor)")
    for name, start, end in schedule():
        axes[0].axvspan(start, end, color="#ff8800", alpha=0.18)
        axes[0].text(start, 1.02, name, fontsize=7, rotation=30, va="bottom")
    axes[0].set_ylim(0, 1.3)
    axes[0].set_title("the-path-motion.mp4 per frame; orange = site schedule from score.ts placed at the MOTION_PLAN video anchors", fontsize=10, loc="left")
    sun = [np.nan if y is None else y for y in series["sun_y"]]
    axes[1].plot(t, sun, color="#2a4bff", label="video: sun centre y, 1080p px")
    axes[2].plot(t, series["ground"], color="#4a2", label="video: ground colour change per frame, dE Lab")
    axes[2].plot(t, series["red_area"] / np.max(series["red_area"]) * max(series["ground"]), color="#d22", lw=1, label="video: red tube area (scaled)")
    axes[3].plot(t, series["text"], color="#c33", label="video: text block change per frame")
    for axis in axes:
        axis.grid(alpha=0.25)
        axis.legend(loc="upper right", fontsize=8)
    axes[-1].set_xticks(np.arange(0, VIDEO_SECONDS + 0.01, 0.5))
    axes[-1].set_xlabel("video seconds")
    plt.tight_layout()
    plt.savefig(path, dpi=80)
    plt.close(figure)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("timing")
    parser.add_argument("--png", required=True)
    parser.add_argument("--timeline", required=True)
    parser.add_argument("--json", required=True)
    args = parser.parse_args()
    data = json.load(open(args.timing))
    fps = data["fps"]
    videos, per_stop, stop_onsets = video_curves(data)
    report = {
        "reference_speed_vh_per_s": round(REFERENCE_SPEED, 4),
        "scrub_lag_s": round(SCRUB_LAG, 4),
        "playback_rate_at_reference": {name: round(playback_rate(name), 3) for name, _, _ in SCENES},
        "video_stop_onsets_s": stop_onsets,
        "video_stops": per_stop,
        "beats": [],
    }
    figure, axes = plt.subplots(len(SITE_BEATS), 1, figsize=(12, 2.0 * len(SITE_BEATS)))
    for axis, (name, (scene_name, progress)) in zip(axes, SITE_BEATS.items()):
        vt, vv = videos[name]
        video = stats(vt, vv)
        entry = {"beat": name, "scene": scene_name, "video": video}
        axis.plot(vt - video["onset"], vv / vv.max(), color="#2a4bff", lw=2, label="video")
        curves = [("steady", steady_scroll(scene_name, progress), "#ff8800", "site model, steady scroll at reference speed")]
        if scene_name.startswith("stop-"):
            curves.append(("snap", snap_glide(progress), "#aa2266", "site model, snap glide rest to rest (sine.inOut)"))
        for key, (st, sv), colour, label in curves:
            site = stats(st, sv)
            site["delta_frames"] = int(round((site["duration"] - video["duration"]) * fps))
            entry[key] = site
            axis.plot(st - site["onset"], sv / sv.max(), color=colour, lw=1.5, label=label)
        report["beats"].append(entry)
        axis.set_title(f"{name}: speed over time, each curve normalised to its peak, aligned at onset (10 % of peak)", fontsize=9, loc="left")
        axis.set_xlim(-0.25, 1.4)
        axis.grid(alpha=0.25)
        axis.legend(fontsize=7, loc="upper right")
    axes[-1].set_xlabel("seconds from onset")
    plt.tight_layout()
    plt.savefig(args.png, dpi=80)
    plt.close(figure)
    plot_timeline(data, args.timeline)
    with open(args.json, "w") as handle:
        json.dump(report, handle, indent=1)
    print(f"reference speed {REFERENCE_SPEED:.3f} vh/s, scrub lag {SCRUB_LAG * 1000:.0f} ms")
    print("playback rate at reference:", report["playback_rate_at_reference"])
    print("video stop morphs:", [f"{s['duration']:.2f}" for s in per_stop])
    print(f"{'beat':16s} {'video':>6s} {'peak@':>6s} | {'steady':>6s} {'peak@':>6s} {'frames':>6s} | {'snap':>6s} {'peak@':>6s} {'frames':>6s}")
    for entry in report["beats"]:
        line = f"{entry['beat']:16s} {entry['video']['duration']:6.2f} {entry['video']['peak_at']:6.2f} |"
        for key in ["steady", "snap"]:
            site = entry.get(key)
            line += f" {site['duration']:6.2f} {site['peak_at']:6.2f} {site['delta_frames']:+6d} |" if site else f" {'':6s} {'':6s} {'':6s} |"
        print(line)


if __name__ == "__main__":
    main()
