from __future__ import annotations

from proxy.app.models import ActionType
from proxy.app.runtime_modes import RuntimeSecurityMode, resolve_degraded_action


def test_strict_mode_fails_closed_on_detection_outage() -> None:
    decision = resolve_degraded_action(
        mode=RuntimeSecurityMode.STRICT,
        prompt_text="hello",
        detection_result={"_degraded": True, "_degraded_reason": "timeout"},
    )

    assert decision.action == ActionType.BLOCK
    assert decision.degraded is True


def test_standard_mode_preserves_availability() -> None:
    decision = resolve_degraded_action(
        mode=RuntimeSecurityMode.STANDARD,
        prompt_text="hello",
        detection_result={"_degraded": True, "_degraded_reason": "exception"},
    )

    assert decision.action == ActionType.ALLOW
    assert decision.degraded is True


def test_hybrid_mode_blocks_sensitive_prompt() -> None:
    decision = resolve_degraded_action(
        mode=RuntimeSecurityMode.HYBRID,
        prompt_text="my ssn is 123-45-6789",
        detection_result={"_degraded": True, "_degraded_reason": "timeout"},
    )

    assert decision.action == ActionType.BLOCK
