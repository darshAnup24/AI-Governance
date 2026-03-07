"""
Multi-provider request/response adapter.
Normalizes requests across OpenAI, Anthropic, Azure OpenAI, and Cohere.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from proxy.app.models import ChatMessage, LLMProvider


@dataclass
class PromptRequest:
    """Normalized internal request format."""
    provider: LLMProvider
    model: str
    messages: list[ChatMessage]
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool = False
    stop: list[str] | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """Normalized internal response format."""
    provider: LLMProvider
    model: str
    content: str
    finish_reason: str = ""
    usage: dict[str, int] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)


class ProviderAdapter:
    """Adapts requests and responses across LLM providers."""

    @staticmethod
    def extract_prompt_text(messages: list[ChatMessage]) -> str:
        """Extract full prompt text from messages for detection scanning."""
        parts: list[str] = []
        for msg in messages:
            if msg.content:
                parts.append(f"[{msg.role}]: {msg.content}")
        return "\n".join(parts)

    @staticmethod
    def normalize_request(provider: LLMProvider, body: dict[str, Any]) -> PromptRequest:
        """Convert provider-specific request body to standard PromptRequest."""
        if provider == LLMProvider.OPENAI or provider == LLMProvider.AZURE_OPENAI:
            messages = [ChatMessage(**m) for m in body.get("messages", [])]
            return PromptRequest(
                provider=provider,
                model=body.get("model", "gpt-4"),
                messages=messages,
                temperature=body.get("temperature"),
                max_tokens=body.get("max_tokens"),
                stream=body.get("stream", False),
                stop=body.get("stop"),
                extra={k: v for k, v in body.items()
                       if k not in {"model", "messages", "temperature", "max_tokens", "stream", "stop"}},
            )
        elif provider == LLMProvider.ANTHROPIC:
            # Anthropic uses messages[] with system as separate field
            system_prompt = body.get("system", "")
            raw_messages = body.get("messages", [])
            messages = []
            if system_prompt:
                messages.append(ChatMessage(role="system", content=system_prompt))
            for m in raw_messages:
                content = m.get("content", "")
                if isinstance(content, list):
                    # Anthropic uses content blocks: [{"type": "text", "text": "..."}]
                    text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
                    content = "\n".join(text_parts)
                messages.append(ChatMessage(role=m.get("role", "user"), content=content))
            return PromptRequest(
                provider=provider,
                model=body.get("model", "claude-3-sonnet-20240229"),
                messages=messages,
                temperature=body.get("temperature"),
                max_tokens=body.get("max_tokens", 1024),
                stream=body.get("stream", False),
                stop=body.get("stop_sequences"),
                extra={},
            )
        elif provider == LLMProvider.COHERE:
            # Cohere uses message/chat_history format
            messages = []
            for m in body.get("chat_history", []):
                role = "assistant" if m.get("role") == "CHATBOT" else "user"
                messages.append(ChatMessage(role=role, content=m.get("message", "")))
            messages.append(ChatMessage(role="user", content=body.get("message", "")))
            return PromptRequest(
                provider=provider,
                model=body.get("model", "command-r-plus"),
                messages=messages,
                temperature=body.get("temperature"),
                max_tokens=body.get("max_tokens"),
                stream=body.get("stream", False),
                extra={},
            )
        else:
            raise ValueError(f"Unsupported provider: {provider}")

    @staticmethod
    def denormalize_request(request: PromptRequest) -> dict[str, Any]:
        """Convert standard PromptRequest back to provider-specific body."""
        if request.provider in (LLMProvider.OPENAI, LLMProvider.AZURE_OPENAI):
            body: dict[str, Any] = {
                "model": request.model,
                "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            }
            if request.temperature is not None:
                body["temperature"] = request.temperature
            if request.max_tokens is not None:
                body["max_tokens"] = request.max_tokens
            if request.stream:
                body["stream"] = True
            if request.stop:
                body["stop"] = request.stop
            body.update(request.extra)
            return body

        elif request.provider == LLMProvider.ANTHROPIC:
            system_msg = ""
            messages = []
            for m in request.messages:
                if m.role == "system":
                    system_msg = m.content or ""
                else:
                    messages.append({"role": m.role, "content": m.content or ""})
            body = {
                "model": request.model,
                "messages": messages,
                "max_tokens": request.max_tokens or 1024,
            }
            if system_msg:
                body["system"] = system_msg
            if request.temperature is not None:
                body["temperature"] = request.temperature
            if request.stream:
                body["stream"] = True
            if request.stop:
                body["stop_sequences"] = request.stop
            return body

        elif request.provider == LLMProvider.COHERE:
            chat_history = []
            user_message = ""
            for m in request.messages:
                if m == request.messages[-1] and m.role == "user":
                    user_message = m.content or ""
                else:
                    role = "CHATBOT" if m.role == "assistant" else "USER"
                    chat_history.append({"role": role, "message": m.content or ""})
            body = {
                "model": request.model,
                "message": user_message,
            }
            if chat_history:
                body["chat_history"] = chat_history
            if request.temperature is not None:
                body["temperature"] = request.temperature
            if request.max_tokens is not None:
                body["max_tokens"] = request.max_tokens
            if request.stream:
                body["stream"] = True
            return body

        raise ValueError(f"Unsupported provider: {request.provider}")

    @staticmethod
    def get_headers(provider: LLMProvider, api_key: str) -> dict[str, str]:
        """Get provider-specific authentication headers."""
        if provider == LLMProvider.OPENAI:
            return {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
        elif provider == LLMProvider.ANTHROPIC:
            return {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
        elif provider == LLMProvider.AZURE_OPENAI:
            return {
                "api-key": api_key,
                "Content-Type": "application/json",
            }
        elif provider == LLMProvider.COHERE:
            return {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
        raise ValueError(f"Unsupported provider: {provider}")

    @staticmethod
    def get_upstream_url(provider: LLMProvider, settings: Any) -> str:
        """Get the upstream URL for the given provider."""
        urls = {
            LLMProvider.OPENAI: settings.upstream_openai_url,
            LLMProvider.ANTHROPIC: settings.upstream_anthropic_url,
            LLMProvider.AZURE_OPENAI: settings.upstream_azure_openai_url,
        }
        base = urls.get(provider, settings.upstream_openai_url)

        endpoints = {
            LLMProvider.OPENAI: "/v1/chat/completions",
            LLMProvider.ANTHROPIC: "/v1/messages",
            LLMProvider.AZURE_OPENAI: "/openai/deployments/gpt-4/chat/completions?api-version=2024-02-01",
            LLMProvider.COHERE: "/v1/chat",
        }
        return base + endpoints.get(provider, "/v1/chat/completions")

    @staticmethod
    def normalize_response(provider: LLMProvider, data: dict[str, Any]) -> LLMResponse:
        """Convert provider-specific response to standard LLMResponse."""
        if provider in (LLMProvider.OPENAI, LLMProvider.AZURE_OPENAI):
            choices = data.get("choices", [{}])
            content = choices[0].get("message", {}).get("content", "") if choices else ""
            return LLMResponse(
                provider=provider,
                model=data.get("model", ""),
                content=content,
                finish_reason=choices[0].get("finish_reason", "") if choices else "",
                usage=data.get("usage", {}),
                raw=data,
            )
        elif provider == LLMProvider.ANTHROPIC:
            content_blocks = data.get("content", [])
            text = "\n".join(c.get("text", "") for c in content_blocks if c.get("type") == "text")
            return LLMResponse(
                provider=provider,
                model=data.get("model", ""),
                content=text,
                finish_reason=data.get("stop_reason", ""),
                usage=data.get("usage", {}),
                raw=data,
            )
        elif provider == LLMProvider.COHERE:
            return LLMResponse(
                provider=provider,
                model=data.get("model", ""),
                content=data.get("text", ""),
                finish_reason=data.get("finish_reason", ""),
                usage={},
                raw=data,
            )
        raise ValueError(f"Unsupported provider: {provider}")
