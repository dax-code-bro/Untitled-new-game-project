"""
Asset generation — creates images, 3D models, and textures for production.
Routes to the appropriate backend (Stable Diffusion, Shap-E, Blender, etc.)
"""

import os
import asyncio
from pathlib import Path

from story.storyboard import Panel


class AssetGenerator:
    def __init__(self, config):
        self.config = config
        self.output_dir = Path(config.output_dir) / "assets"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def generate_panel_image(self, panel: Panel) -> str:
        """Generate an image for a single storyboard panel."""
        prompt = self._build_image_prompt(panel)
        filename = f"panel_{panel.id:04d}.png"
        output_path = self.output_dir / "images" / filename
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Route to image backend
        backend = os.environ.get("IMAGE_BACKEND", "stable_diffusion")
        if backend == "dall_e":
            return await self._generate_dalle(prompt, str(output_path))
        elif backend == "comfyui":
            return await self._generate_comfyui(prompt, str(output_path))
        else:
            return await self._generate_stable_diffusion(prompt, str(output_path))

    async def generate_3d_model(
        self, description: str, output_name: str
    ) -> str:
        """Generate a 3D model from a text description (Shap-E or similar)."""
        output_path = self.output_dir / "models" / f"{output_name}.glb"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        return await self._generate_shape(description, str(output_path))

    async def generate_texture(
        self, description: str, resolution: int = 2048
    ) -> str:
        """Generate a seamless texture from a description."""
        prompt = f"seamless tileable texture, {description}, game texture, PBR material, 4k"
        output_path = self.output_dir / "textures" / f"{description[:32].replace(' ', '_')}.png"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        return await self._generate_stable_diffusion(prompt, str(output_path))

    def _build_image_prompt(self, panel: Panel) -> str:
        style_map = {
            "cinematic": "cinematic film still, dramatic lighting, high detail",
            "anime": "anime art style, detailed, vibrant colors",
            "comic": "comic book art, bold lines, flat colors, ink",
            "realistic": "photorealistic, detailed, 8k",
            "cartoon": "cartoon style, clean lines, bright colors",
        }
        style = style_map.get(self.config.style, "high quality illustration")
        mood_lighting = {
            "dark": "dark, moody, low key lighting",
            "bright": "bright, cheerful, high key lighting",
            "mysterious": "mysterious, foggy, ambient light",
            "epic": "epic, dramatic, golden hour lighting",
        }.get(panel.mood, "natural lighting")

        return f"{panel.image_prompt}, {style}, {mood_lighting}, {panel.camera} shot"

    async def _generate_stable_diffusion(self, prompt: str, output_path: str) -> str:
        """Call local Stable Diffusion (ComfyUI or A1111) API."""
        sd_url = os.environ.get("SD_API_URL", "http://localhost:7860")
        # Actual SD API call would go here
        # For now, create a placeholder file
        Path(output_path).write_text(f"[SD placeholder: {prompt[:80]}]")
        return output_path

    async def _generate_dalle(self, prompt: str, output_path: str) -> str:
        """Generate image via OpenAI DALL-E."""
        import openai
        client = openai.AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
        response = await client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1792x1024",
            quality="hd",
            n=1,
        )
        import httpx
        image_url = response.data[0].url
        async with httpx.AsyncClient() as http:
            img_response = await http.get(image_url)
            Path(output_path).write_bytes(img_response.content)
        return output_path

    async def _generate_comfyui(self, prompt: str, output_path: str) -> str:
        """Generate image via ComfyUI API."""
        comfy_url = os.environ.get("COMFYUI_URL", "http://localhost:8188")
        Path(output_path).write_text(f"[ComfyUI placeholder: {prompt[:80]}]")
        return output_path

    async def _generate_shape(self, description: str, output_path: str) -> str:
        """Generate 3D model via Shap-E or similar."""
        Path(output_path).write_text(f"[3D model placeholder: {description[:80]}]")
        return output_path
