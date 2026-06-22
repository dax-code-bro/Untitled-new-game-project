"""
Legend's AI brain — orchestrates Atom (Qwen 32B), Claude, and ChatGPT,
routes requests, manages context and memory across the full session.

Atom is Legend's primary brain: an OpenAI-compatible endpoint serving a
Qwen 32B model (with an 8B vision model) hosted on the OasisOS platform.
Claude and OpenAI act as optional failover brains when their keys are set.
"""

import os
from typing import AsyncGenerator, Optional
from enum import Enum

from core.memory import Memory
from core.personality import LEGEND_SYSTEM_PROMPT


class AIModel(str, Enum):
    ATOM = "atom"
    CLAUDE = "claude"
    OPENAI = "openai"


class Brain:
    def __init__(self, config: dict):
        self.config = config
        self.memory = Memory(max_history=config["ai"]["memory"]["max_history"])
        self.primary = AIModel(config["ai"]["primary"])
        self.fallback = AIModel(config["ai"]["fallback"])

        self.temperature = config["ai"]["temperature"]
        self.max_tokens = config["ai"]["max_tokens"]

        models = config["ai"]["models"]
        self.atom_model = models.get("atom", "atom-32b")
        self.claude_model = models.get("claude", "claude-opus-4-7")
        self.openai_model = models.get("openai", "gpt-4o")

        # --- Atom (primary brain) — OpenAI-compatible endpoint ---
        self._atom = None
        atom_key = os.environ.get("ATOM_API_KEY")
        if atom_key:
            import openai
            self._atom = openai.AsyncOpenAI(
                api_key=atom_key,
                base_url=os.environ.get("ATOM_BASE_URL", "https://oasisos.io/api/v1"),
            )

        # --- Claude (optional failover) ---
        self._claude = None
        if os.environ.get("ANTHROPIC_API_KEY"):
            import anthropic
            self._claude = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

        # --- OpenAI (optional failover) ---
        self._openai = None
        if os.environ.get("OPENAI_API_KEY"):
            import openai
            self._openai = openai.AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

        if not any([self._atom, self._claude, self._openai]):
            raise RuntimeError(
                "No AI brain configured. Set ATOM_API_KEY (recommended) "
                "and/or ANTHROPIC_API_KEY / OPENAI_API_KEY."
            )

    def _client_for(self, model: AIModel):
        return {
            AIModel.ATOM: self._atom,
            AIModel.CLAUDE: self._claude,
            AIModel.OPENAI: self._openai,
        }[model]

    async def think(
        self,
        user_message: str,
        mode: str = "conversation",
        model: Optional[AIModel] = None,
        system_override: Optional[str] = None,
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Core reasoning method — routes to the right model and streams the response."""
        self.memory.add_user(user_message)
        system = system_override or LEGEND_SYSTEM_PROMPT.format(mode=mode)
        target = model or self.primary

        # If the requested brain isn't configured, fall through to one that is.
        if self._client_for(target) is None:
            target = next(
                (m for m in (self.primary, self.fallback, *AIModel)
                 if self._client_for(m) is not None),
                None,
            )
            if target is None:
                raise RuntimeError("No AI brain is configured.")

        try:
            if target == AIModel.CLAUDE:
                async for chunk in self._think_claude(system, stream):
                    yield chunk
            elif target == AIModel.ATOM:
                async for chunk in self._think_openai_compatible(
                    self._atom, self.atom_model, system, stream
                ):
                    yield chunk
            else:
                async for chunk in self._think_openai_compatible(
                    self._openai, self.openai_model, system, stream
                ):
                    yield chunk
        except Exception as e:
            # Failover to the next configured brain that isn't the one that just failed.
            backup = next(
                (m for m in (self.fallback, *AIModel)
                 if m != target and self._client_for(m) is not None),
                None,
            )
            if backup is not None:
                async for chunk in self.think(
                    user_message, mode, backup, system_override, stream
                ):
                    yield chunk
            else:
                raise RuntimeError(f"AI brain failed and no backup available: {e}") from e

    async def _think_claude(
        self, system: str, stream: bool
    ) -> AsyncGenerator[str, None]:
        messages = self.memory.to_anthropic_format()

        if stream:
            with self._claude.messages.stream(
                model=self.claude_model,
                max_tokens=self.max_tokens,
                system=system,
                messages=messages,
            ) as s:
                full_response = ""
                for text in s.text_stream:
                    full_response += text
                    yield text
                self.memory.add_assistant(full_response)
        else:
            response = self._claude.messages.create(
                model=self.claude_model,
                max_tokens=self.max_tokens,
                system=system,
                messages=messages,
            )
            content = response.content[0].text
            self.memory.add_assistant(content)
            yield content

    async def _think_openai_compatible(
        self, client, model_name: str, system: str, stream: bool
    ) -> AsyncGenerator[str, None]:
        """Shared path for any OpenAI-compatible endpoint (Atom and OpenAI)."""
        messages = [{"role": "system", "content": system}]
        messages += self.memory.to_openai_format()

        if stream:
            stream_response = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                stream=True,
            )
            full_response = ""
            async for chunk in stream_response:
                text = chunk.choices[0].delta.content or ""
                full_response += text
                yield text
            self.memory.add_assistant(full_response)
        else:
            response = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            content = response.choices[0].message.content
            self.memory.add_assistant(content)
            yield content

    def reset_memory(self):
        self.memory.clear()

    def get_memory_summary(self) -> dict:
        return self.memory.summary()
