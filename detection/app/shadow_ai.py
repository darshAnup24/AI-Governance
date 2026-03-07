"""
Shadow AI Detection — Domain registry, DNS log parser, and event emitter.
Detects unauthorized AI tool usage by analyzing network metadata only (no content inspection).
"""

from __future__ import annotations

import os
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import structlog
import yaml

log = structlog.get_logger()


class AIToolCategory(str, Enum):
    LLM_CHATBOT = "LLM_CHATBOT"
    AI_CODING = "AI_CODING"
    AI_WRITING = "AI_WRITING"
    AI_IMAGE = "AI_IMAGE"
    AI_AUDIO = "AI_AUDIO"
    AI_VIDEO = "AI_VIDEO"
    AI_SEARCH = "AI_SEARCH"
    UNKNOWN_AI = "UNKNOWN_AI"


class EventSource(str, Enum):
    DNS = "DNS"
    SNI = "SNI"
    PROXY = "PROXY"


@dataclass
class ShadowAIEvent:
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.utcnow)
    user_id: str = ""
    tool_name: str = ""
    domain: str = ""
    category: AIToolCategory = AIToolCategory.UNKNOWN_AI
    is_authorized: bool = False
    source: EventSource = EventSource.DNS


@dataclass
class DomainEntry:
    domain: str
    tool_name: str
    category: AIToolCategory


class AIDomainRegistry:
    """
    Registry of known AI tool domains.
    Loads from ai_domains.yaml, supports authorized domain overrides.
    """

    def __init__(self, config_path: str | None = None) -> None:
        self._domains: dict[str, DomainEntry] = {}
        self._authorized: set[str] = set()

        if config_path is None:
            config_path = str(Path(__file__).parent / "ai_domains.yaml")

        self._load_config(config_path)

    def _load_config(self, path: str) -> None:
        """Load domain registry from YAML config."""
        try:
            with open(path) as f:
                config = yaml.safe_load(f)

            for category_name, entries in config.get("categories", {}).items():
                try:
                    category = AIToolCategory(category_name)
                except ValueError:
                    category = AIToolCategory.UNKNOWN_AI

                for entry in entries:
                    domain = entry["domain"].lower()
                    self._domains[domain] = DomainEntry(
                        domain=domain,
                        tool_name=entry.get("tool_name", domain),
                        category=category,
                    )

            for domain in config.get("authorized_domains", []):
                self._authorized.add(domain.lower())

            log.info("shadow_ai.registry_loaded", domains=len(self._domains), authorized=len(self._authorized))

        except FileNotFoundError:
            log.warning("shadow_ai.config_not_found", path=path)
        except Exception as e:
            log.error("shadow_ai.config_load_error", error=str(e))

    def is_ai_domain(self, domain: str) -> bool:
        """Check if a domain belongs to a known AI tool."""
        domain = domain.lower().strip(".")
        # Direct match
        if domain in self._domains:
            return True
        # Subdomain match (e.g., api.openai.com → openai.com)
        parts = domain.split(".")
        for i in range(1, len(parts)):
            parent = ".".join(parts[i:])
            if parent in self._domains:
                return True
        return False

    def is_shadow_ai(self, domain: str) -> bool:
        """Check if domain is an AI tool AND not authorized."""
        return self.is_ai_domain(domain) and not self.is_authorized(domain)

    def is_authorized(self, domain: str) -> bool:
        """Check if domain is in the authorized list."""
        domain = domain.lower().strip(".")
        if domain in self._authorized:
            return True
        parts = domain.split(".")
        for i in range(1, len(parts)):
            if ".".join(parts[i:]) in self._authorized:
                return True
        return False

    def get_tool_name(self, domain: str) -> str:
        """Get human-readable tool name for a domain."""
        domain = domain.lower().strip(".")
        if domain in self._domains:
            return self._domains[domain].tool_name
        parts = domain.split(".")
        for i in range(1, len(parts)):
            parent = ".".join(parts[i:])
            if parent in self._domains:
                return self._domains[parent].tool_name
        return domain

    def get_category(self, domain: str) -> AIToolCategory:
        """Get the category of the AI tool."""
        domain = domain.lower().strip(".")
        if domain in self._domains:
            return self._domains[domain].category
        parts = domain.split(".")
        for i in range(1, len(parts)):
            parent = ".".join(parts[i:])
            if parent in self._domains:
                return self._domains[parent].category
        return AIToolCategory.UNKNOWN_AI


class DNSLogParser:
    """
    Parses DNS query logs to detect AI tool domain lookups.
    Supports BIND query log format.
    """

    # BIND query log format: 15-Jan-2024 10:30:45.123 queries: info: client @0x... 192.168.1.100#12345 (chat.openai.com): query: chat.openai.com IN A
    BIND_PATTERN = re.compile(
        r"(?P<timestamp>\S+ \S+)\s+queries:\s+\w+:\s+client\s+\S+\s+"
        r"(?P<client_ip>[\d.]+)#\d+\s+\((?P<domain>[^)]+)\):\s+query:"
    )

    # Generic DNS log format: timestamp client_ip domain
    GENERIC_PATTERN = re.compile(
        r"(?P<timestamp>[\d\-T:.]+)\s+(?P<client_ip>[\d.]+)\s+(?P<domain>\S+)"
    )

    def __init__(self, registry: AIDomainRegistry) -> None:
        self.registry = registry

    def parse_line(self, line: str) -> ShadowAIEvent | None:
        """Parse a single DNS log line, return ShadowAIEvent if AI domain detected."""
        match = self.BIND_PATTERN.search(line)
        if not match:
            match = self.GENERIC_PATTERN.search(line)
        if not match:
            return None

        domain = match.group("domain").lower().strip(".")
        client_ip = match.group("client_ip")

        if not self.registry.is_ai_domain(domain):
            return None

        return ShadowAIEvent(
            user_id=client_ip,  # Resolved to user via IP→user mapping
            tool_name=self.registry.get_tool_name(domain),
            domain=domain,
            category=self.registry.get_category(domain),
            is_authorized=self.registry.is_authorized(domain),
            source=EventSource.DNS,
        )

    def parse_log_file(self, filepath: str) -> list[ShadowAIEvent]:
        """Parse an entire DNS log file and return all AI domain events."""
        events: list[ShadowAIEvent] = []
        try:
            with open(filepath) as f:
                for line in f:
                    event = self.parse_line(line.strip())
                    if event:
                        events.append(event)
        except FileNotFoundError:
            log.warning("shadow_ai.log_file_not_found", path=filepath)
        except Exception as e:
            log.error("shadow_ai.log_parse_error", error=str(e), path=filepath)
        return events
