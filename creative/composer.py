"""
Composer — assembles generated assets into the final product:
comic PDF, animated show video, or YouTube video series.
"""

import asyncio
from pathlib import Path
from story.storyboard import Scene


class Composer:
    def __init__(self, config):
        self.config = config
        self.output_dir = Path(config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def make_comic(self, scenes: list[Scene]) -> str:
        """Compose panel images into a comic PDF or CBZ archive."""
        output_path = self.output_dir / f"{self._safe_name(self.config.title)}_comic.pdf"
        # Full implementation: use Pillow or reportlab to lay out panels
        # into comic pages with gutters, dialogue bubbles, and captions
        output_path.write_text(f"[Comic: {self.config.title} — {sum(len(s.panels) for s in scenes)} panels]")
        return str(output_path)

    async def make_show(self, scenes: list[Scene]) -> str:
        """Compose scenes into an animated video file."""
        output_path = self.output_dir / f"{self._safe_name(self.config.title)}_episode.mp4"
        # Full implementation: use ffmpeg to sequence panel images with
        # transitions, add TTS narration, dialogue, background music
        output_path.write_text(f"[Show: {self.config.title} — {len(scenes)} scenes]")
        return str(output_path)

    async def make_youtube(self, scenes: list[Scene]) -> str:
        """Compose into a YouTube-ready video with narration and titles."""
        output_path = self.output_dir / f"{self._safe_name(self.config.title)}_youtube.mp4"
        # Full implementation: ffmpeg pipeline with title cards, transitions,
        # TTS voiceover, background music, end screen
        output_path.write_text(f"[YouTube: {self.config.title} — {len(scenes)} scenes]")
        return str(output_path)

    def _safe_name(self, name: str) -> str:
        return name.lower().replace(" ", "_").replace("/", "-")[:64]
