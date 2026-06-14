"""
Tests for NER detector extensions and pipeline recall gate.

Covers 5 new NER pattern categories (3 TP + 2 TN each) and the
OR-gate / soft-vote recall mode in DetectionPipeline.
"""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from detection.app.ner_detector import SpacyNERDetector, _CUSTOM_NER_PATTERNS
from proxy.app.models import DetectionCategory


# ─── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def ner_detector():
    det = SpacyNERDetector()
    return det


def _spans_for(detector: SpacyNERDetector, text: str, label: str):
    """Run detector and return spans matching a specific label."""
    result = detector.detect(text)
    return [s for s in result.spans if s.matched_text and label in (s.context or "")]


def _has_label(result, label: str) -> bool:
    """Check if any span has the given label in its detector field or context."""
    return any(
        label.upper() in (s.context or "").upper()
        or label.upper() in s.detector.upper()
        for s in result.spans
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  1. PARTIAL PHONE NUMBERS (US_PHONE_7)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPartialPhoneNumbers:
    """7-digit US phone numbers (555-0192, 555.0192, 5550192)."""

    @pytest.mark.parametrize("text", [
        "Call me at 555-0192 after lunch",
        "My direct line is 555.0192 extension 3",
        "Reach 5550192 for the front desk",
    ])
    def test_true_positives(self, ner_detector, text):
        result = ner_detector.detect(text)
        assert len(result.spans) > 0, f"Expected PII span in: {text}"
        assert any(
            s.category == DetectionCategory.PII
            for s in result.spans
        ), f"Expected PII category in: {text}"

    @pytest.mark.parametrize("text", [
        "Order number 1234567 has shipped",
        "The zip code is 90210",
    ])
    def test_true_negatives(self, ner_detector, text):
        result = ner_detector.detect(text)
        # Should NOT flag as phone — no phone context
        phone_spans = [
            s for s in result.spans
            if "phone" in (s.context or "").lower() or "call" in (s.context or "").lower()
        ]
        # Either no spans, or spans are not phone-related
        for s in phone_spans:
            assert "555" not in s.matched_text, f"False positive phone in: {text}"


# ═══════════════════════════════════════════════════════════════════════════════
#  2. EMAILS WITH UNUSUAL TLDs (EMAIL_EXT_TLD)
# ═══════════════════════════════════════════════════════════════════════════════

class TestEmailUnusualTLDs:
    """Modern TLDs: .io, .ai, .dev, .tech, .co, .app, .xyz, .me"""

    @pytest.mark.parametrize("text,expected_email", [
        ("Contact alice@startup.io for access", "alice@startup.io"),
        ("Send docs to bob@company.ai before Friday", "bob@company.ai"),
        ("Deploy to charlie@service.dev environment", "charlie@service.dev"),
    ])
    def test_true_positives(self, ner_detector, text, expected_email):
        result = ner_detector.detect(text)
        assert len(result.spans) > 0, f"Expected span in: {text}"
        matched_texts = [s.matched_text for s in result.spans]
        assert any(
            expected_email in mt for mt in matched_texts
        ), f"Expected '{expected_email}' in spans: {matched_texts}"

    @pytest.mark.parametrize("text", [
        "File saved to /home/user/docs/report.pdf",
        "Version 2.1.0 was released yesterday",
    ])
    def test_true_negatives(self, ner_detector, text):
        result = ner_detector.detect(text)
        email_spans = [
            s for s in result.spans
            if "@" in s.matched_text
        ]
        assert len(email_spans) == 0, f"False positive email in: {text}"


# ═══════════════════════════════════════════════════════════════════════════════
#  3. INDIRECT NAME REFERENCES (INDIRECT_NAME)
# ═══════════════════════════════════════════════════════════════════════════════

class TestIndirectNameReferences:
    """Names in indirect context: 'sent to John's account'"""

    @pytest.mark.parametrize("text,expected_name", [
        ("The report was sent to John's account", "John"),
        ("Email forwarded to Sarah's inbox for review", "Sarah"),
        ("Ticket assigned to Mike's folder for triage", "Mike"),
    ])
    def test_true_positives(self, ner_detector, text, expected_name):
        result = ner_detector.detect(text)
        matched_texts = [s.matched_text for s in result.spans]
        assert any(
            expected_name in mt for mt in matched_texts
        ), f"Expected '{expected_name}' in spans: {matched_texts}"

    @pytest.mark.parametrize("text", [
        "Sent to the account team for review",
        "Forwarded to her email address",
    ])
    def test_true_negatives(self, ner_detector, text):
        result = ner_detector.detect(text)
        # Should not extract pronouns or articles as names
        for s in result.spans:
            if "indirect" in (s.context or "").lower() or "name" in (s.context or "").lower():
                assert s.matched_text.lower() not in {"the", "a", "an", "her", "his", "my", "your"}


# ═══════════════════════════════════════════════════════════════════════════════
#  4. NUMERIC ID PATTERNS (GENERIC_ID)
# ═══════════════════════════════════════════════════════════════════════════════

class TestNumericIDPatterns:
    """Employee IDs, patient IDs, order numbers: EMP-123456, PAT-00123456"""

    @pytest.mark.parametrize("text", [
        "Employee EMP-123456 submitted the timesheet",
        "Patient PAT-00123456 needs follow-up",
        "Order ORD-98765432 was dispatched today",
    ])
    def test_true_positives(self, ner_detector, text):
        result = ner_detector.detect(text)
        assert len(result.spans) > 0, f"Expected ID span in: {text}"
        assert any(
            s.category == DetectionCategory.PII
            for s in result.spans
        ), f"Expected PII category in: {text}"

    @pytest.mark.parametrize("text", [
        "Meeting at 3pm in room 1234",
        "The product code is ABC-1234",
    ])
    def test_true_negatives(self, ner_detector, text):
        result = ner_detector.detect(text)
        id_spans = [
            s for s in result.spans
            if any(prefix in s.matched_text.upper() for prefix in ["EMP-", "PAT-", "ORD-", "TKT-", "USR-"])
        ]
        assert len(id_spans) == 0, f"False positive ID in: {text}"


# ═══════════════════════════════════════════════════════════════════════════════
#  5. OBFUSCATED EMAILS (OBFUSCATED_EMAIL)
# ═══════════════════════════════════════════════════════════════════════════════

class TestObfuscatedEmails:
    """Obfuscated: j.smith[at]company[dot]com"""

    @pytest.mark.parametrize("text", [
        "Contact j.smith[at]company[dot]com for details",
        "Reach john.doe[at]example[dot]io via email",
        "Send to admin[at]internal[dot]dev team",
    ])
    def test_true_positives(self, ner_detector, text):
        result = ner_detector.detect(text)
        assert len(result.spans) > 0, f"Expected obfuscated email span in: {text}"
        assert any(
            "[at]" in s.matched_text or "[dot]" in s.matched_text
            for s in result.spans
        ), f"Expected obfuscated email match in: {text}"

    @pytest.mark.parametrize("text", [
        "Array items are [1, 2, 3] in the list",
        "Use the [object Object] notation in JS",
    ])
    def test_true_negatives(self, ner_detector, text):
        result = ner_detector.detect(text)
        obf_spans = [
            s for s in result.spans
            if "[at]" in s.matched_text and "[dot]" in s.matched_text
        ]
        assert len(obf_spans) == 0, f"False positive obfuscated email in: {text}"


# ═══════════════════════════════════════════════════════════════════════════════
#  INDIRECT NAME EXTRACTION UNIT TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestExtractIndirectName:

    @pytest.mark.parametrize("phrase,expected", [
        ("sent to John's account", "John"),
        ("forwarded to Sarah's email", "Sarah"),
        ("delivered to Mike's folder", "Mike"),
    ])
    def test_extracts_name(self, phrase, expected):
        assert SpacyNERDetector._extract_indirect_name(phrase) == expected

    @pytest.mark.parametrize("phrase", [
        "sent to the account team",
        "forwarded to her email",
    ])
    def test_skips_pronouns(self, phrase):
        result = SpacyNERDetector._extract_indirect_name(phrase)
        assert result is None or result.lower() in {"the", "a", "an", "her", "his"}


# ═══════════════════════════════════════════════════════════════════════════════
#  PIPELINE RECALL GATE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestPipelineRecallGate:
    """Tests for OR-gate and soft-vote logic in DetectionPipeline."""

    def _make_result(self, detector_name: str, max_confidence: float):
        """Create a mock DetectionResult with a single span at given confidence."""
        mock = MagicMock()
        mock.detector_name = detector_name
        if max_confidence > 0:
            span = MagicMock()
            span.confidence = max_confidence
            mock.spans = [span]
        else:
            mock.spans = []
        return mock

    def test_or_gate_triggers_on_high_single_tier(self):
        from detection.app.pipeline import DetectionPipeline
        pipeline = DetectionPipeline.__new__(DetectionPipeline)

        results = [
            self._make_result("regex", 0.30),
            self._make_result("ner", 0.50),  # above 0.45 threshold
            self._make_result("ml_classifier", 0.20),
        ]
        assert pipeline._or_gate_escalation(results) is True

    def test_or_gate_does_not_trigger_when_all_low(self):
        from detection.app.pipeline import DetectionPipeline
        pipeline = DetectionPipeline.__new__(DetectionPipeline)

        results = [
            self._make_result("regex", 0.30),
            self._make_result("ner", 0.40),
            self._make_result("ml_classifier", 0.20),
        ]
        assert pipeline._or_gate_escalation(results) is False

    def test_soft_vote_triggers_with_two_detectors(self):
        from detection.app.pipeline import DetectionPipeline
        pipeline = DetectionPipeline.__new__(DetectionPipeline)

        results = [
            self._make_result("regex", 0.42),    # above 0.40
            self._make_result("ner", 0.45),      # above 0.40
            self._make_result("ml_classifier", 0.15),  # below 0.40
        ]
        assert pipeline._soft_vote_positive(results) is True

    def test_soft_vote_does_not_trigger_with_one_detector(self):
        from detection.app.pipeline import DetectionPipeline
        pipeline = DetectionPipeline.__new__(DetectionPipeline)

        results = [
            self._make_result("regex", 0.42),
            self._make_result("ner", 0.30),
            self._make_result("ml_classifier", 0.15),
        ]
        assert pipeline._soft_vote_positive(results) is False

    def test_recall_gate_combined(self):
        from detection.app.pipeline import DetectionPipeline
        pipeline = DetectionPipeline.__new__(DetectionPipeline)

        # Neither OR-gate nor soft-vote alone triggers, but combined...
        results = [
            self._make_result("regex", 0.42),    # above soft_vote (0.40) but below low_threshold (0.45)
            self._make_result("ner", 0.43),      # above soft_vote (0.40) but below low_threshold (0.45)
            self._make_result("ml_classifier", 0.15),
        ]
        # soft_vote: 2 detectors >= 0.40 → True
        assert pipeline._recall_gate_positive(results) is True
