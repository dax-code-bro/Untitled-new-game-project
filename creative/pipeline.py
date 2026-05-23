"""
Legend's creative production pipeline.
Takes a story/storyboard and drives it through: assets → render → compose → output.
Supports: comic, animated show, YouTube video series.
"""

import asyncio
from dataclasses import dataclass
from enum import Enum
from typing import AsyncGenerator

from story.storyboard import Scene, Panel
from creative.assets import AssetGenerator
from creative.composer import Composer


class ProductionTarget(str, Enum):
    COMIC = "comic"
    SHOW = "show"
    YOUTUBE = "youtube"


@dataclass
class ProductionConfig:
    target: ProductionTarget
    title: str
    output_dir: str = "./output"
    resolution: tuple[int, int] = (1920, 1080)
    fps: int = 24
    style: str = "cinematic"  # cinematic | anime | comic | realistic | cartoon


@dataclass
class ProductionStatus:
    stage: str
    progress: float  # 0.0 - 1.0
    message: str
    asset_path: str | None = None


class CreativePipeline:
    def __init__(self, config: ProductionConfig):
        self.config = config
        self.assets = AssetGenerator(config)
        self.composer = Composer(config)

    async def produce(
        self, scenes: list[Scene]
    ) -> AsyncGenerator[ProductionStatus, None]:
        """Run the full production pipeline on a list of storyboard scenes."""
        total_panels = sum(len(s.panels) for s in scenes)
        processed = 0

        yield ProductionStatus("start", 0.0, f"Starting production: {self.config.title}")

        # Stage 1: Generate all image assets
        yield ProductionStatus("assets", 0.0, "Generating visual assets...")
        for scene in scenes:
            for panel in scene.panels:
                asset_path = await self.assets.generate_panel_image(panel)
                processed += 1
                progress = processed / total_panels * 0.6
                yield ProductionStatus(
                    "assets",
                    progress,
                    f"Panel {processed}/{total_panels}: {panel.description[:60]}...",
                    asset_path=asset_path,
                )

        # Stage 2: Compose final output
        yield ProductionStatus("compose", 0.6, "Composing final output...")

        if self.config.target == ProductionTarget.COMIC:
            output = await self.composer.make_comic(scenes)
        elif self.config.target == ProductionTarget.SHOW:
            output = await self.composer.make_show(scenes)
        else:
            output = await self.composer.make_youtube(scenes)

        yield ProductionStatus(
            "complete", 1.0, f"Production complete: {output}", asset_path=output
        )

    async def quick_preview(self, panel: Panel) -> str:
        """Generate a single panel preview — fast feedback loop."""
        return await self.assets.generate_panel_image(panel)
