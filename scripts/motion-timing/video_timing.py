import argparse
import json

import cv2
import numpy as np

WIDTH, HEIGHT = 960, 540
OPEN = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
GROW = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
FLOW_PAD = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
SUN_SEARCH_FRAMES = 120
EASES = {
    "linear": lambda u: u,
    "sine.inOut": lambda u: 0.5 - 0.5 * np.cos(np.pi * u),
    "power1.inOut": lambda u: np.where(u < 0.5, 2 * u * u, 1 - (-2 * u + 2) ** 2 / 2),
    "power2.inOut": lambda u: np.where(u < 0.5, 4 * u ** 3, 1 - (-2 * u + 2) ** 3 / 2),
    "power3.inOut": lambda u: np.where(u < 0.5, 8 * u ** 4, 1 - (-2 * u + 2) ** 4 / 2),
    "expo.inOut": lambda u: np.where(u < 0.5, 2 ** (20 * u - 10) / 2, (2 - 2 ** (-20 * u + 10)) / 2),
    "power1.out": lambda u: 1 - (1 - u) ** 2,
    "power2.out": lambda u: 1 - (1 - u) ** 3,
    "power3.out": lambda u: 1 - (1 - u) ** 4,
    "power4.out": lambda u: 1 - (1 - u) ** 5,
    "expo.out": lambda u: 1 - 2 ** (-10 * u),
    "power1.in": lambda u: u ** 2,
    "power2.in": lambda u: u ** 3,
}


def tube_masks(image):
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    vivid = (saturation > 120) & (value > 140)
    blue = vivid & (hue > 100) & (hue < 135)
    red = vivid & ((hue < 10) | (hue > 170))
    blue = cv2.morphologyEx(blue.astype(np.uint8), cv2.MORPH_OPEN, OPEN)
    red = cv2.morphologyEx(red.astype(np.uint8), cv2.MORPH_OPEN, OPEN)
    return blue, red


def sun_blob(mask):
    count, _, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    best = None
    for k in range(1, count):
        _, top, width, height, area = stats[k]
        if area < 300 or width > 200 or height > 200:
            continue
        if area / (np.pi * (max(width, height) / 2) ** 2) < 0.55:
            continue
        if best is None or area > best["area"]:
            best = {"x": float(centroids[k][0]), "y": float(centroids[k][1]), "w": int(width), "h": int(height), "area": int(area)}
    return best


def measure_frames(video_path):
    capture = cv2.VideoCapture(video_path)
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    rows, previous, index = [], None, 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        image = cv2.resize(frame, (WIDTH, HEIGHT), interpolation=cv2.INTER_AREA)
        blue, red = tube_masks(image)
        tube = blue | red
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray, (WIDTH // 2, HEIGHT // 2), interpolation=cv2.INTER_AREA)
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
        band = (slice(int(HEIGHT * 0.86), int(HEIGHT * 0.99)), slice(int(WIDTH * 0.25), int(WIDTH * 0.45)))
        ground_pixels = lab[band].reshape(-1, 3)
        free = ~tube[band].reshape(-1).astype(bool)
        ground = np.median(ground_pixels[free] if free.sum() > 50 else ground_pixels, axis=0)
        row = {
            "t": index / fps,
            "tube_area": int(tube.sum()),
            "red_area": int(red.sum()),
            "ground_lab": [float(x) for x in ground],
            "sun": sun_blob(blue) if index < SUN_SEARCH_FRAMES else None,
            "tube_flow": 0.0,
            "text_change": 0.0,
        }
        if previous is not None:
            last_tube, last_small, last_gray = previous
            flow = cv2.calcOpticalFlowFarneback(last_small, small, None, 0.5, 3, 21, 3, 5, 1.1, 0)
            magnitude = np.linalg.norm(flow, axis=2) * 2.0
            union = cv2.resize((tube | last_tube).astype(np.uint8), (WIDTH // 2, HEIGHT // 2), interpolation=cv2.INTER_NEAREST)
            union = cv2.dilate(union, FLOW_PAD).astype(bool)
            row["tube_flow"] = float(magnitude[union].sum())
            keep_out = cv2.dilate(tube | last_tube, GROW).astype(bool)
            difference = np.abs(gray.astype(np.int16) - last_gray.astype(np.int16)).astype(np.float32)
            ground_shift = np.median(difference[~keep_out])
            text_block = np.zeros_like(keep_out)
            text_block[int(HEIGHT * 0.08):int(HEIGHT * 0.62), :int(WIDTH * 0.62)] = True
            row["text_change"] = float(np.clip(difference[text_block & ~keep_out] - ground_shift, 0, None).mean())
        rows.append(row)
        previous = (tube, small, gray)
        index += 1
    return rows, fps


def median3(values):
    padded = np.r_[values[0], values, values[-1]]
    return np.median(np.stack([padded[:-2], padded[1:-1], padded[2:]]), axis=0)


def rolling_floor(values, window, percentile):
    half = window // 2
    return np.array([np.percentile(values[max(0, i - half):i + half + 1], percentile) for i in range(len(values))])


def best_ease(energy):
    cumulative = np.cumsum(energy)
    if cumulative[-1] <= 0:
        return None, None
    progress = np.r_[0, cumulative / cumulative[-1]]
    u = np.linspace(0, 1, len(progress))
    errors = {name: float(np.sqrt(np.mean((ease(u) - progress) ** 2))) for name, ease in EASES.items()}
    name = min(errors, key=errors.get)
    return name, errors[name]


def active_spans(signal, floor_share, gap, shortest):
    active = signal > floor_share * np.percentile(signal, 98)
    spans, start = [], None
    for i, on in enumerate(active):
        if on and start is None:
            start = i
        if not on and start is not None:
            spans.append([start, i - 1])
            start = None
    if start is not None:
        spans.append([start, len(signal) - 1])
    merged = []
    for span in spans:
        if merged and span[0] - merged[-1][1] <= gap + 1:
            merged[-1][1] = span[1]
        else:
            merged.append(span)
    return [span for span in merged if span[1] - span[0] + 1 >= shortest]


def describe(signal, span, fps):
    first, last = span
    part = signal[first:last + 1]
    peak = first + int(np.argmax(part))
    above = np.where(part > 0.1 * part.max())[0]
    onset, settle = first + int(above[0]), first + int(above[-1])
    ease, error = best_ease(signal[onset:settle + 1])
    return {
        "onset_s": round(onset / fps, 3),
        "peak_s": round(peak / fps, 3),
        "settle_s": round(settle / fps, 3),
        "duration_s": round((settle - onset + 1) / fps, 3),
        "peak_at": round((peak - onset) / max(1, settle - onset), 2),
        "ease": ease,
        "ease_rmse": round(error, 3) if error is not None else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("out")
    args = parser.parse_args()
    rows, fps = measure_frames(args.video)
    flow = median3(np.array([r["tube_flow"] for r in rows]))
    text = median3(np.array([r["text_change"] for r in rows]))
    lab = np.array([r["ground_lab"] for r in rows])
    tube_signal = np.clip(flow - rolling_floor(flow, 45, 20), 0, None)
    text_signal = np.clip(text - rolling_floor(text, 61, 30), 0, None)
    ground_signal = median3(np.r_[0, np.linalg.norm(np.diff(lab, axis=0), axis=1)])
    result = {
        "fps": fps,
        "frames": len(rows),
        "tube": [describe(tube_signal, s, fps) for s in active_spans(tube_signal, 0.06, 2, 4)],
        "ground": [describe(ground_signal, s, fps) for s in active_spans(ground_signal, 0.08, 3, 3)],
        "text": [describe(text_signal, s, fps) for s in active_spans(text_signal, 0.12, 2, 3)],
        "series": {
            "t": [round(r["t"], 4) for r in rows],
            "tube": tube_signal.round(1).tolist(),
            "text": text_signal.round(3).tolist(),
            "ground": ground_signal.round(3).tolist(),
            "ground_L": lab[:, 0].round(1).tolist(),
            "tube_area": [r["tube_area"] for r in rows],
            "red_area": [r["red_area"] for r in rows],
            "sun_y": [round(r["sun"]["y"] * 1080 / HEIGHT, 1) if r["sun"] else None for r in rows],
            "sun_w": [round(r["sun"]["w"] * 1080 / HEIGHT, 1) if r["sun"] else None for r in rows],
        },
    }
    with open(args.out, "w") as handle:
        json.dump(result, handle)
    for key in ["tube", "ground", "text"]:
        print(f"{key}: {len(result[key])} beats")
        for beat in result[key]:
            print(f"  {beat['onset_s']:6.2f} -> {beat['settle_s']:6.2f} ({beat['duration_s']:.2f} s) peak at {beat['peak_at']:.2f}, {beat['ease']}")


if __name__ == "__main__":
    main()
