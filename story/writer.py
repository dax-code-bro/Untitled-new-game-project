"""
Legend's story engine — generates stories, scripts, and comic scripts
from a premise or conversation. Can structure output for visual production.
"""

from typing import AsyncGenerator, Optional
from dataclasses import dataclass

from core.brain import Brain, AIModel
from core.personality import LEGEND_SYSTEM_PROMPT


STORY_SYSTEM = """You are Legend in story mode — one of the greatest storytellers ever built.

You write with:
- Vivid, sensory detail that puts the reader inside the world
- Characters who feel real: they want things, fear things, change
- Scenes with purpose — every moment advances the story
- Dialogue that sounds like people actually talk
- Pacing that knows when to slow down and when to hit hard

Output format guidance:
- For prose: flowing narrative paragraphs
- For comic scripts: PAGE/PANEL format with visual descriptions and dialogue
- For screenplays: proper screenplay format (INT./EXT., action lines, dialogue)
- For storyboards: numbered scene descriptions with camera angles and mood

Genre: {genre}
Format: {format}
Target: {target}

Build the world. Make it real. Make it legendary."""


@dataclass
class StoryConfig:
    genre: str = "general"
    format: str = "prose"
    target: str = "story"  # story | comic | screenplay | storyboard | youtube_series
    chapters: int = 1
    words_per_chapter: int = 1000


@dataclass
class StoryChunk:
    type: str  # prose | panel | scene | chapter_title | end
    content: str
    metadata: dict = None


class StoryWriter:
    def __init__(self, brain: Brain):
        self.brain = brain

    async def write(
        self,
        premise: str,
        config: Optional[StoryConfig] = None,
        model: Optional[AIModel] = None,
    ) -> AsyncGenerator[StoryChunk, None]:
        """Generate a story from a premise. Streams chunks as they're produced."""
        cfg = config or StoryConfig()
        system = STORY_SYSTEM.format(
            genre=cfg.genre,
            format=cfg.format,
            target=cfg.target,
        )

        prompt = self._build_prompt(premise, cfg)

        async for text in self.brain.think(
            prompt,
            mode="story",
            model=model,
            system_override=system,
            stream=True,
        ):
            yield StoryChunk(type="prose", content=text)

    async def continue_story(
        self, direction: str, config: Optional[StoryConfig] = None
    ) -> AsyncGenerator[StoryChunk, None]:
        """Continue the current story given a direction or user input."""
        cfg = config or StoryConfig()
        system = STORY_SYSTEM.format(
            genre=cfg.genre, format=cfg.format, target=cfg.target
        )

        async for text in self.brain.think(
            f"Continue the story: {direction}",
            mode="story",
            system_override=system,
            stream=True,
        ):
            yield StoryChunk(type="prose", content=text)

    async def adapt_for_production(
        self,
        story_text: str,
        target: str,  # comic | show | youtube
    ) -> AsyncGenerator[StoryChunk, None]:
        """Convert a prose story into a production-ready format."""
        format_map = {
            "comic": "comic panel script with PAGE/PANEL headers, visual descriptions, and dialogue",
            "show": "TV screenplay format with scenes, action lines, and dialogue",
            "youtube": "YouTube video script with segments, narration, and visual cues",
        }

        system = STORY_SYSTEM.format(
            genre="adaptation",
            format=format_map.get(target, "script"),
            target=target,
        )

        prompt = f"""Adapt this story into {format_map.get(target, target)} format:

{story_text}

Make it ready for production. Be specific about visuals, timing, and what the audience sees."""

        async for text in self.brain.think(
            prompt, mode="director", system_override=system, stream=True
        ):
            yield StoryChunk(type="script", content=text, metadata={"target": target})

    def _build_prompt(self, premise: str, cfg: StoryConfig) -> str:
        if cfg.target == "comic":
            return f"""Write a {cfg.genre} comic script based on this premise:

{premise}

Format as a proper comic script with PAGE and PANEL breakdowns.
Include: panel descriptions (what we see), character positions, dialogue, captions.
Make it visual. Make it dramatic. Make it legendary."""

        elif cfg.target == "youtube_series":
            return f"""Create a {cfg.genre} YouTube video series outline and pilot episode script based on:

{premise}

Include:
- Series title and concept
- Episode 1 full script with segments
- Hook, content, and call to action
- Visual direction notes"""

        elif cfg.target == "screenplay":
            return f"""Write a {cfg.genre} screenplay scene or short film based on:

{premise}

Use proper screenplay format. Focus on what the camera sees and what characters say."""

        else:
            return f"""Write a compelling {cfg.genre} story based on this premise:

{premise}

Make it vivid, emotional, and real. About {cfg.words_per_chapter} words."""
