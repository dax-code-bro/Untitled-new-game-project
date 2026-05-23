"""
Conversation memory — tracks history, summarizes when needed,
and formats messages for both Claude and OpenAI APIs.
"""

from dataclasses import dataclass, field
from typing import Literal
from datetime import datetime


@dataclass
class Message:
    role: Literal["user", "assistant"]
    content: str
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class Memory:
    def __init__(self, max_history: int = 100):
        self.max_history = max_history
        self._messages: list[Message] = []
        self._summary: str = ""

    def add_user(self, content: str):
        self._messages.append(Message(role="user", content=content))
        self._trim()

    def add_assistant(self, content: str):
        self._messages.append(Message(role="assistant", content=content))

    def _trim(self):
        """Keep memory within bounds; older messages are dropped (future: summarize)."""
        if len(self._messages) > self.max_history:
            self._messages = self._messages[-self.max_history:]

    def to_anthropic_format(self) -> list[dict]:
        return [{"role": m.role, "content": m.content} for m in self._messages]

    def to_openai_format(self) -> list[dict]:
        return [{"role": m.role, "content": m.content} for m in self._messages]

    def clear(self):
        self._messages = []
        self._summary = ""

    def summary(self) -> dict:
        return {
            "message_count": len(self._messages),
            "user_turns": sum(1 for m in self._messages if m.role == "user"),
            "assistant_turns": sum(1 for m in self._messages if m.role == "assistant"),
        }

    def __len__(self) -> int:
        return len(self._messages)
