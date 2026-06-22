"""
talk_to_legend.py — the simplest way to talk to Legend from your terminal.

Setup (one time):
    pip install openai python-dotenv pyyaml
    # Make sure .env exists in the project root with ATOM_API_KEY set.

Run:
    python scripts/talk_to_legend.py

Type your message and press Enter. Type 'quit' to leave.
"""

import os
import sys
import asyncio
from pathlib import Path

# Load .env so ATOM_API_KEY is available without ever hardcoding it.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

# Make the project importable when run from anywhere.
sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml
from core.brain import Brain


def load_config() -> dict:
    config_path = Path(__file__).parent.parent / "config" / "legend.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


async def main():
    if not os.environ.get("ATOM_API_KEY"):
        print("No ATOM_API_KEY found. Add it to your .env file first.")
        return

    brain = Brain(load_config())
    print("Legend is online. Type 'quit' to exit.\n")

    while True:
        try:
            user = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nLegend: Talk soon.")
            break
        if not user or user.lower() in {"quit", "exit"}:
            print("Legend: Talk soon.")
            break

        print("Legend: ", end="", flush=True)
        async for chunk in brain.think(user, stream=True):
            print(chunk, end="", flush=True)
        print("\n")


if __name__ == "__main__":
    asyncio.run(main())
