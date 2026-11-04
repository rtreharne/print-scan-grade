"""Render production-style diagnostic overlays for layout-4 dummy sheets.

This is a review utility, not a second grading engine. Its circle geometry and
classification mirror app/static/scan.js so exported review images are useful
for comparing detector changes with the browser workspace.
"""
import argparse
import math
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont


A4_WIDTH = 595.2756
A4_HEIGHT = 841.8898
QUESTION_TOP = 460
QUESTION_BOTTOM = 38
QUESTIONS_PER_COLUMN = 15
QUESTION_RADIUS = 6.8
QUESTION_PITCH = 20.5
ID_FIRST_X = 27 + 2 + 34
ID_FIRST_Y = A4_HEIGHT - (A4_HEIGHT - 145 - 13)
ID_PITCH = 20.5
ID_ROW_PITCH = 14.5


def histogram_percentile(histogram, count, fraction):
    target = math.floor((count - 1) * fraction)
    seen = 0
    for value, occurrences in enumerate(histogram):
        seen += occurrences
        if seen > target:
            return value
    return 255


def histogram_count_below(histogram, threshold):
    return sum(histogram[:max(0, min(256, math.ceil(threshold)))])


class CircleReader:
    """The production analyseCircle algorithm, adapted for a PIL grayscale page."""

    def __init__(self, image):
        self.image = image.convert("L")
        self.pixels = self.image.load()
        self.width, self.height = self.image.size
        self.offsets = {}

    def _offsets(self, radius):
        key = round(radius, 3)
        if key in self.offsets:
            return self.offsets[key]
        ring_inner, ring_outer = radius * 0.78, radius * 1.12
        outside_inner, outside_outer = radius * 1.3, radius * 1.62
        central_outer = radius * 0.55
        limit = math.ceil(outside_outer)
        ring, outside, central = [], [], []
        for dy in range(-limit, limit + 1):
            for dx in range(-limit, limit + 1):
                distance_squared = dx * dx + dy * dy
                if ring_inner * ring_inner <= distance_squared <= ring_outer * ring_outer:
                    ring.append((dx, dy))
                elif outside_inner * outside_inner <= distance_squared <= outside_outer * outside_outer:
                    outside.append((dx, dy))
                if distance_squared <= central_outer * central_outer:
                    central.append((dx, dy))
        self.offsets[key] = (ring, outside, central)
        return self.offsets[key]

    def _ring_stats(self, cx, cy, radius):
        ring, outside, _ = self._offsets(radius)
        ring_histogram, outside_histogram = [0] * 256, [0] * 256
        ring_count = outside_count = 0
        for dx, dy in ring:
            px, py = cx + dx, cy + dy
            if 0 <= px < self.width and 0 <= py < self.height:
                ring_histogram[self.pixels[px, py]] += 1
                ring_count += 1
        for dx, dy in outside:
            px, py = cx + dx, cy + dy
            if 0 <= px < self.width and 0 <= py < self.height:
                outside_histogram[self.pixels[px, py]] += 1
                outside_count += 1
        return ring_histogram, ring_count, outside_histogram, outside_count

    def _central_stats(self, cx, cy, radius):
        _, _, central = self._offsets(radius)
        histogram, total = [0] * 256, 0
        for dx, dy in central:
            px, py = cx + dx, cy + dy
            if 0 <= px < self.width and 0 <= py < self.height:
                histogram[self.pixels[px, py]] += 1
                total += 1
        return histogram, total

    def analyse(self, expected_x, expected_y, radius):
        radius = max(4, radius)
        search = max(1, round(radius * 0.46))
        half = max(1, round(search / 2))
        candidates = [
            (dx, dy)
            for dy in (-search, -half, 0, half, search)
            for dx in (-search, -half, 0, half, search)
            if math.hypot(dx, dy) <= search + 0.01
        ]
        best = None
        for dx, dy in candidates:
            cx, cy = round(expected_x + dx), round(expected_y + dy)
            ring, ring_count, outside, outside_count = self._ring_stats(cx, cy, radius)
            if not ring_count or not outside_count:
                continue
            paper = histogram_percentile(outside, outside_count, 0.75)
            outline = histogram_percentile(ring, ring_count, 0.2)
            score = paper - outline - math.hypot(dx, dy) / radius * 0.35
            if best is None or score > best[0]:
                best = (score, cx, cy, paper, ring, ring_count, outside, outside_count)
        if best is None:
            return {"cx": round(expected_x), "cy": round(expected_y), "filled": False,
                    "dark_threshold": 140}
        score, cx, cy, paper, ring, ring_count, outside, outside_count = best
        central, central_count = self._central_stats(cx, cy, radius)
        dark_threshold = max(70, min(140, paper - 50))
        fill_ratio = histogram_count_below(central, dark_threshold) / max(1, central_count)
        return {
            "cx": cx,
            "cy": cy,
            "filled": score >= max(3, paper * 0.012) and fill_ratio >= 0.30,
            "dark_threshold": dark_threshold,
        }

    def diagonal_stats(self, cx, cy, radius, dark_threshold, start_scale, end_scale, line_half_width):
        start, end = max(2, round(radius * start_scale)), round(radius * end_scale)
        ratios = []
        for direction in (1, -1):
            hits = samples = 0
            for sign in (-1, 1):
                for distance in range(start, end + 1):
                    dx = round(distance / math.sqrt(2)) * sign
                    dy = round(distance / math.sqrt(2)) * sign * direction
                    dark = False
                    for offset in range(-line_half_width, line_half_width + 1):
                        px, py = cx + dx + offset, cy + dy - offset * direction
                        if 0 <= px < self.width and 0 <= py < self.height:
                            dark = dark or self.pixels[px, py] < dark_threshold
                    hits += dark
                    samples += 1
            ratios.append(hits / samples if samples else 0)
        return min(ratios), max(ratios)


def draw_circle(draw, item):
    radius, cx, cy = item["radius"], item["cx"], item["cy"]
    colour = (0, 168, 120, 245) if item["filled"] else (40, 120, 200, 205)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=colour, width=3)
    if item["filled"]:
        inner = radius * 0.42
        draw.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=(0, 168, 120, 125))
    if item.get("crossed"):
        span = radius * 0.72
        draw.line((cx - span, cy - span, cx + span, cy + span), fill=(217, 83, 79, 255), width=4)
        draw.line((cx + span, cy - span, cx - span, cy + span), fill=(217, 83, 79, 255), width=4)


def render_page(pdf_path, output_path):
    with pymupdf.open(pdf_path) as document:
        page = document[0]
        scale = 1500 / page.rect.width
        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csGRAY, alpha=False
        )
    page_image = Image.frombytes("L", (pixmap.width, pixmap.height), pixmap.samples).convert("RGB")
    scale = page_image.width / A4_WIDTH
    reader = CircleReader(page_image)
    bubbles = []
    row_pitch = (QUESTION_TOP - QUESTION_BOTTOM) / (QUESTIONS_PER_COLUMN - 1)
    for column in range(2):
        for row in range(QUESTIONS_PER_COLUMN):
            question = column * QUESTIONS_PER_COLUMN + row + 1
            if question > 20:
                break
            x = 27 + column * ((A4_WIDTH - 54) / 2) + 30
            y = QUESTION_TOP - row * row_pitch
            for choice in range(4):
                item = reader.analyse(
                    (x + choice * QUESTION_PITCH) * scale,
                    (A4_HEIGHT - y) * scale,
                    QUESTION_RADIUS * scale,
                )
                item.update({"radius": QUESTION_RADIUS * scale, "question": question, "choice": choice})
                bubbles.append(item)
    for column in range(9):
        for digit in range(10):
            item = reader.analyse(
                (ID_FIRST_X + column * ID_PITCH) * scale,
                (ID_FIRST_Y + digit * ID_ROW_PITCH) * scale,
                QUESTION_RADIUS * scale,
            )
            item.update({"radius": QUESTION_RADIUS * scale, "question": None, "choice": digit})
            bubbles.append(item)
    for item in bubbles:
        if not item["filled"] or item["question"] is None:
            item["crossed"] = False
            continue
        cross_min, cross_max = reader.diagonal_stats(
            item["cx"], item["cy"], item["radius"], item["dark_threshold"], 0.5, 1.5, 1
        )
        extension_min, extension_max = reader.diagonal_stats(
            item["cx"], item["cy"], item["radius"], item["dark_threshold"], 0.8, 1.8, 3
        )
        outer_min, outer_max = reader.diagonal_stats(
            item["cx"], item["cy"], item["radius"], item["dark_threshold"], 1.0, 1.8, 3
        )
        item["crossed"] = extension_max >= 0.5 and (outer_max >= 0.5 or cross_min >= 0.75)
    overlay = Image.new("RGBA", page_image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for item in bubbles:
        draw_circle(draw, item)
    draw.rounded_rectangle((990, 25, 1475, 75), radius=8, fill=(255, 255, 255, 225),
                           outline=(30, 40, 45, 180), width=1)
    draw.text((1005, 43), "Green: filled    Blue: blank    Red X: crossed",
              fill=(15, 20, 25, 255), font=ImageFont.load_default())
    Image.alpha_composite(page_image.convert("RGBA"), overlay).convert("RGB").save(output_path, optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)
    rendered_pages = []
    for pdf_path in sorted(args.input_directory.glob("*.pdf")):
        output_path = args.output_directory / f"{pdf_path.stem}.png"
        render_page(pdf_path, output_path)
        rendered_pages.append(output_path)
    if rendered_pages:
        contact_sheet = Image.new("RGB", (1524, 1460), "white")
        for index, output_path in enumerate(rendered_pages):
            thumbnail = Image.open(output_path).convert("RGB")
            thumbnail.thumbnail((500, 708))
            contact_sheet.paste(thumbnail, (8 + (index % 3) * 508, 8 + (index // 3) * 725))
        contact_sheet.save(args.output_directory / "contact-sheet.png", optimize=True)


if __name__ == "__main__":
    main()
