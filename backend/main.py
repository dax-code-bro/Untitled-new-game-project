"""
Legend API — FastAPI server that powers the web UI, desktop app,
Blender addon, Unity plugin, and Unreal plugin.
"""

import yaml
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.brain import Brain, AIModel
from story.writer import StoryWriter, StoryConfig
from story.storyboard import Storyboard
from creative.pipeline import CreativePipeline, ProductionConfig, ProductionTarget
from creative.assets import AssetGenerator
from integrations.github.github_integration import GitHubIntegration


def load_config() -> dict:
    config_path = Path(__file__).parent.parent / "config" / "legend.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


CONFIG = load_config()
brain: Brain = None
story_writer: StoryWriter = None
github: GitHubIntegration = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global brain, story_writer, github
    brain = Brain(CONFIG)
    story_writer = StoryWriter(brain)
    github = GitHubIntegration()
    print("Legend AI is online.")
    yield
    print("Legend AI shutting down.")


app = FastAPI(
    title="Legend AI",
    description="The ultimate AI — conversation, storytelling, and creative production",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CONFIG["api"]["cors_origins"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response Models ---

class ChatRequest(BaseModel):
    message: str
    mode: str = "conversation"
    model: str | None = None

class ChatResponse(BaseModel):
    response: str

class StoryRequest(BaseModel):
    premise: str
    genre: str = "general"
    format: str = "prose"
    target: str = "story"

class AdaptRequest(BaseModel):
    story: str
    target: str  # comic | show | youtube

class ModelRequest(BaseModel):
    description: str

class TextureRequest(BaseModel):
    description: str
    resolution: int = 2048

class AssetResponse(BaseModel):
    path: str

class GitHubReadRequest(BaseModel):
    owner: str
    repo: str
    paths: list[str]
    ref: str = "main"

class GitHubWriteRequest(BaseModel):
    owner: str
    repo: str
    path: str
    content: str
    message: str
    branch: str = "main"

class ResetRequest(BaseModel):
    confirm: bool = False


# --- Chat Routes ---

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Talk to Legend. Returns full response."""
    model = AIModel(req.model) if req.model else None
    response = ""
    async for chunk in brain.think(req.message, mode=req.mode, model=model, stream=False):
        response += chunk
    return ChatResponse(response=response)


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Talk to Legend. Streams response as Server-Sent Events."""
    model = AIModel(req.model) if req.model else None

    async def generate():
        async for chunk in brain.think(req.message, mode=req.mode, model=model, stream=True):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/chat/reset")
async def reset_chat(req: ResetRequest):
    if req.confirm:
        brain.reset_memory()
        return {"status": "memory cleared"}
    return {"status": "no change"}


@app.get("/chat/memory")
async def get_memory():
    return brain.get_memory_summary()


# --- Story Routes ---

@app.post("/story/write")
async def write_story(req: StoryRequest):
    """Write a story from a premise. Streams the result."""
    config = StoryConfig(genre=req.genre, format=req.format, target=req.target)

    async def generate():
        async for chunk in story_writer.write(req.premise, config=config):
            yield f"data: {chunk.content}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/story/continue")
async def continue_story(req: ChatRequest):
    """Continue the current story."""
    async def generate():
        async for chunk in story_writer.continue_story(req.message):
            yield f"data: {chunk.content}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/story/adapt")
async def adapt_story(req: AdaptRequest):
    """Adapt a story into comic, show, or YouTube format."""
    async def generate():
        async for chunk in story_writer.adapt_for_production(req.story, req.target):
            yield f"data: {chunk.content}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/story/storyboard")
async def make_storyboard(req: AdaptRequest):
    """Convert a story into a structured storyboard."""
    board = Storyboard(brain)
    scenes = []
    async for scene in board.from_story(req.story):
        scenes.append({
            "scene_title": scene.scene_title,
            "location": scene.location,
            "time_of_day": scene.time_of_day,
            "panels": [p.__dict__ for p in scene.panels],
        })
    return {"scenes": scenes}


# --- Creative Routes ---

@app.post("/creative/model", response_model=AssetResponse)
async def generate_model(req: ModelRequest):
    """Generate a 3D model from a description."""
    cfg = ProductionConfig(
        target=ProductionTarget.COMIC,
        title="model",
        output_dir="./output",
    )
    generator = AssetGenerator(cfg)
    path = await generator.generate_3d_model(req.description, req.description[:32].replace(" ", "_"))
    return AssetResponse(path=path)


@app.post("/creative/texture", response_model=AssetResponse)
async def generate_texture(req: TextureRequest):
    """Generate a texture from a description."""
    cfg = ProductionConfig(target=ProductionTarget.COMIC, title="texture", output_dir="./output")
    generator = AssetGenerator(cfg)
    path = await generator.generate_texture(req.description, req.resolution)
    return AssetResponse(path=path)


@app.post("/creative/produce")
async def produce(title: str, story: str, target: str = "comic"):
    """Full production pipeline: story → storyboard → assets → final output."""
    board = Storyboard(brain)
    scenes = []
    async for scene in board.from_story(story):
        scenes.append(scene)

    cfg = ProductionConfig(
        target=ProductionTarget(target),
        title=title,
        output_dir="./output",
    )
    pipeline = CreativePipeline(cfg)

    async def generate():
        async for status in pipeline.produce(scenes):
            import json
            yield f"data: {json.dumps({'stage': status.stage, 'progress': status.progress, 'message': status.message})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# --- GitHub Routes ---

@app.post("/github/read")
async def github_read(req: GitHubReadRequest):
    """Read files from a GitHub repo and return them as context."""
    context = await github.read_repo_context(req.owner, req.repo, req.paths, req.ref)
    return {"files": context, "count": len(context)}


@app.post("/github/write")
async def github_write(req: GitHubWriteRequest):
    """Write a file to a GitHub repository."""
    result = await github.write_file(
        req.owner, req.repo, req.path, req.content, req.message, req.branch
    )
    return {"sha": result.sha, "url": result.url, "message": result.message}


# --- Health ---

@app.get("/")
async def root():
    return {
        "name": "Legend AI",
        "version": "0.1.0",
        "status": "online",
        "models": {
            "primary": CONFIG["ai"]["primary"],
            "claude": CONFIG["ai"]["models"]["claude"],
            "openai": CONFIG["ai"]["models"]["openai"],
        },
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
