"""
Converts story text into structured storyboard data — scenes, panels,
visual prompts, and camera directions ready for the creative pipeline.
"""

import json
from dataclasses import dataclass, field
from typing import AsyncGenerator

from core.brain import Brain


STORYBOARD_SYSTEM = """You are Legend's visual director.

Your job: take story text and break it down into a precise storyboard.

For each scene/panel output valid JSON with this structure:
{
  "panels": [
    {
      "id": 1,
      "type": "establishing|action|dialogue|reaction|insert",
      "camera": "wide|medium|close|extreme_close|overhead|low_angle|dutch",
      "description": "What the camera sees — specific, visual, painterly",
      "characters": ["list of characters in frame"],
      "dialogue": "spoken line if any, else null",
      "caption": "narration caption if any, else null",
      "mood": "the emotional tone",
      "image_prompt": "Detailed prompt for AI image generation of this panel",
      "duration_seconds": 3
    }
  ],
  "scene_title": "Scene name",
  "location": "Where this takes place",
  "time_of_day": "day/night/dawn/dusk"
}

Output ONLY valid JSON. No markdown. No explanation."""


@dataclass
class Panel:
    id: int
    type: str
    camera: str
    description: str
    characters: list[str]
    dialogue: str | None
    caption: str | None
    mood: str
    image_prompt: str
    duration_seconds: int = 3


@dataclass
class Scene:
    scene_title: str
    location: str
    time_of_day: str
    panels: list[Panel] = field(default_factory=list)


class Storyboard:
    def __init__(self, brain: Brain):
        self.brain = brain
        self.scenes: list[Scene] = []

    async def from_story(self, story_text: str) -> AsyncGenerator[Scene, None]:
        """Parse a story into storyboard scenes, streaming one scene at a time."""
        segments = self._split_into_scenes(story_text)

        for segment in segments:
            scene = await self._process_scene(segment)
            if scene:
                self.scenes.append(scene)
                yield scene

    async def _process_scene(self, scene_text: str) -> Scene | None:
        prompt = f"Convert this story passage into a storyboard:\n\n{scene_text}"
        raw = ""

        async for chunk in self.brain.think(
            prompt,
            mode="director",
            system_override=STORYBOARD_SYSTEM,
            stream=False,
        ):
            raw += chunk

        try:
            data = json.loads(raw)
            panels = [Panel(**p) for p in data.get("panels", [])]
            return Scene(
                scene_title=data.get("scene_title", "Untitled Scene"),
                location=data.get("location", "Unknown"),
                time_of_day=data.get("time_of_day", "day"),
                panels=panels,
            )
        except (json.JSONDecodeError, TypeError):
            return None

    def _split_into_scenes(self, text: str, max_chars: int = 800) -> list[str]:
        """Split story text into manageable scene segments."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        scenes = []
        current = ""

        for para in paragraphs:
            if len(current) + len(para) > max_chars and current:
                scenes.append(current.strip())
                current = para
            else:
                current += "\n\n" + para

        if current:
            scenes.append(current.strip())

        return scenes

    def to_dict(self) -> list[dict]:
        result = []
        for scene in self.scenes:
            result.append(
                {
                    "scene_title": scene.scene_title,
                    "location": scene.location,
                    "time_of_day": scene.time_of_day,
                    "panels": [p.__dict__ for p in scene.panels],
                }
            )
        return result
