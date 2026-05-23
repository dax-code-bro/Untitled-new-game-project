"""
Legend's AI brain — orchestrates Claude and ChatGPT, routes requests,
manages context and memory across the full session.
"""

import os
from typing import AsyncGenerator, Optional
from enum import Enum

import anthropic
import openai

from core.memory import Memory
from core.personality import LEGEND_SYSTEM_PROMPT


class AIModel(str, Enum):
    CLAUDE = "claude"
    OPENAI = "openai"


class Brain:
    def __init__(self, config: dict):
        self.config = config
        self.memory = Memory(max_history=config["ai"]["memory"]["max_history"])
        self.primary = AIModel(config["ai"]["primary"])
        self.fallback = AIModel(config["ai"]["fallback"])

        self._claude = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._openai = openai.AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

        self.claude_model = config["ai"]["models"]["claude"]
        self.openai_model = config["ai"]["models"]["openai"]
        self.temperature = config["ai"]["temperature"]
        self.max_tokens = config["ai"]["max_tokens"]

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

        try:
            if target == AIModel.CLAUDE:
                async for chunk in self._think_claude(system, stream):
                    yield chunk
            else:
                async for chunk in self._think_openai(system, stream):
                    yield chunk
        except Exception as e:
            if target == self.primary:
                # Failover to fallback model
                fallback = self.fallback
                async for chunk in self.think(
                    user_message, mode, fallback, system_override, stream
                ):
                    yield chunk
            else:
                raise RuntimeError(f"Both AI models failed: {e}") from e

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

    async def _think_openai(
        self, system: str, stream: bool
    ) -> AsyncGenerator[str, None]:
        messages = [{"role": "system", "content": system}]
        messages += self.memory.to_openai_format()

        if stream:
            stream_response = await self._openai.chat.completions.create(
                model=self.openai_model,
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
            response = await self._openai.chat.completions.create(
                model=self.openai_model,
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
