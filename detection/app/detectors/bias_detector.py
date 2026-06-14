"""
Bias Detector — Detects bias patterns in AI-generated content.
Covers gender, racial/ethnic, age, confirmation, and geographic bias.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


class BiasDetector:
    """Detect bias patterns in AI-generated text."""

    # ─── Gender Bias ─────────────────────────────────────────────────────────
    GENDER_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        # Stereotypical trait associations
        (re.compile(r"\b(?:she|her)\s+(?:is|was|seems?|appears?|looks?)\s+(?:emotional|nurturing|supportive|caring|gentle|sweet|docile|passive|submissive)\b", re.I), 0.75, "Gender stereotype: associating femininity with emotional/nurturing traits"),
        (re.compile(r"\b(?:he|his)\s+(?:is|was|seems?|appears?|looks?)\s+(?:strong|decisive|aggressive|assertive|dominant|rational|logical|competitive|ambitious)\b", re.I), 0.70, "Gender stereotype: associating masculinity with strength/authority"),
        (re.compile(r"\b(?:women|females|girls)\s+(?:are|tend to be|are naturally)\s+(?:emotional|nurturing|gentle|passive|irrational|hysterical|overly sensitive)\b", re.I), 0.85, "Gender essentialism: attributing traits to an entire gender"),
        (re.compile(r"\b(?:men|males|boys)\s+(?:are|tend to be|are naturally)\s+(?:strong|logical|rational|assertive|dominant|aggressive|competitive)\b", re.I), 0.85, "Gender essentialism: attributing traits to an entire gender"),
        # Professional role gendering
        (re.compile(r"\b(?:female|woman|girl)\s+(?:engineer|developer|programmer|scientist|doctor|CEO|executive|manager|director|analyst|architect|designer)\b", re.I), 0.65, "Unnecessarily gendering professional roles implies it's unusual"),
        (re.compile(r"\b(?:male|man)\s+(?:nurse|teacher|secretary|receptionist|caregiver|homemaker|nanny|assistant)\b", re.I), 0.65, "Unnecessarily gendering professional roles implies it's unusual"),
        # Comparative superiority
        (re.compile(r"\b(?:men|males)\s+(?:are|make)\s+(?:better|superior|more effective|more capable)\s+\w+\s+(?:than|compared to)\s+(?:women|females)\b", re.I), 0.90, "Gender-based superiority claim"),
        (re.compile(r"\b(?:women|females)\s+(?:are|make)\s+(?:better|superior|more effective|more capable)\s+\w+\s+(?:than|compared to)\s+(?:men|males)\b", re.I), 0.90, "Gender-based superiority claim"),
        (re.compile(r"\b(?:men|males)\s+(?:are|make)\s+(?:better|superior|more effective|more capable)\s+(?:leaders|managers|engineers|scientists|programmers)\b", re.I), 0.90, "Gender-based superiority claim"),
        # Exclusionary language
        (re.compile(r"\b(?:women|females|she)\s+(?:shouldn'?t|should not|can'?t|cannot|isn'?t|is not)\s+(?:apply|work|lead|manage|code|program|engineer|drive|fight)\b", re.I), 0.90, "Exclusionary language based on gender"),
        (re.compile(r"\b(?:women|females)\s+(?:belong|belongs)\s+(?:in|only in)\s+(?:the kitchen|the home|the nursery|domestic)\b", re.I), 0.95, "Explicit gender discrimination"),
        (re.compile(r"\b(?:not\s+(?:suitable|fit|appropriate)\s+for\s+(?:women|females))\b", re.I), 0.85, "Gender-based exclusion"),
        (re.compile(r"\b(?:male\s+(?:only|preferred|dominated))\b", re.I), 0.85, "Gender-based hiring preference"),
        # Tokenism / objectification
        (re.compile(r"\b(?:she(?:'?s)?|he(?:'?s)?)\s+(?:just|only|merely)\s+a\s+(?:secretary|girl|boy|diversity hire|token)\b", re.I), 0.80, "Dismissive language reducing person to gender role"),
        # Working mother/parent double standard
        (re.compile(r"\bworking\s+(?:mother|mom|mum|parent)\b", re.I), 0.60, "The term 'working mother' implies motherhood is the default, not work"),
        (re.compile(r"\b(?:mother|mom|mum)\s+(?:should|must|ought to)\s+(?:stay home|quit|focus on family)\b", re.I), 0.85, "Gendered expectation about work-life balance"),
        (re.compile(r"\b(?:she|her|women|females)\s+(?:is|are|'?s)?\s+(?:too\s+)?(?:bossy|emotional|shrill|nagging|abrasive|aggressive|intimidating)\b", re.I), 0.80, "Gendered trait labeling used to diminish women"),
        (re.compile(r"\b(?:requires?|needs?|looking for)\s+(?:a\s+)?(?:male|man|boy)\s+(?:candidate|applicant|worker|employee|person|only)\b", re.I), 0.85, "Gender-based hiring exclusion"),
        (re.compile(r"\b(?:women|females|she)\s+(?:don'?t|doesn'?t|can'?t|shouldn'?t)\s+(?:belong|fit|succeed|thrive)\s+(?:in|as)\s+(?:leadership|management|stem|tech|engineering)\b", re.I), 0.90, "Gender-based role exclusion"),
    ]

    # ─── Racial/Ethnic Bias ─────────────────────────────────────────────────
    RACIAL_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        # Microaggressions
        (re.compile(r"\b(?:articulate|well-spoken|well-spoken|eloquent)\b.*\b(?:Black|African|minority|diverse)\b", re.I), 0.85, "Describing minority individuals as 'articulate' implies surprise"),
        (re.compile(r"\b(?:exotic|oriental|primitive|savage|uncivilized|barbaric|heathen)\b", re.I), 0.80, "Using antiquated or dehumanizing racial descriptors"),
        # Coded language
        (re.compile(r"\b(?:inner[- ]city|urban|ghetto|hood)\b.*\b(?:crime|violence|danger|poverty|drugs|gang)\b", re.I), 0.75, "Coded language associating urban areas with negative stereotypes"),
        (re.compile(r"\b(?:those people|that kind|their kind|these people)\s+(?:are|do|will|can't|won't|don't)\b", re.I), 0.70, "Dehumanizing group generalization"),
        # Immigration discrimination
        (re.compile(r"\b(?:illegal (?:alien|immigrant|migrant))\b", re.I), 0.80, "Use 'undocumented immigrant' or 'unauthorized migrant' instead"),
        (re.compile(r"\b(?:go back to|return to)\s+(?:your country|where you came from)\b", re.I), 0.90, "Xenophobic exclusionary phrase"),
        # Derogatory terms
        (re.compile(r"\b(?:third[- ]world|backward|undeveloped)\s+(?:country|nation|people|culture|mentality)\b", re.I), 0.75, "Use 'developing nation' or 'Global South' instead"),
        (re.compile(r"\b(?:ethnic\s+tax)\b", re.I), 0.70, "Reference to burden placed on minorities to educate others"),
        # Stereotype attributions
        (re.compile(r"\b(?:all|every|each)\s+(?:Asian|Black|Hispanic|Latino|Indian|Arab|Chinese|Japanese|Korean)\s+(?:people|person|guy|girl|man|woman|student)\s+(?:is|are|does|can|should|will)\b", re.I), 0.90, "Racial generalization"),
        (re.compile(r"\b(?:Asians|Indians|Chinese|Japanese|Koreans)\s+(?:are|tend to be|are all|are naturally)\s+(?:good at|good with|skilled at|gifted in)\s+(?:math|science|coding|technology|engineering)\b", re.I), 0.85, "Positive racial stereotype"),
        (re.compile(r"\b(?:Black|African)\s+(?:people|men|women|person)\s+(?:are|tend to be|are all|are naturally)\s+(?:athletic|aggressive|criminal|violent|loud)\b", re.I), 0.90, "Negative racial stereotype"),
        # Dog whistle language
        (re.compile(r"\b(?:thug|gangbanger|welfare queen|anchor baby)\b", re.I), 0.80, "Racially coded derogatory terms"),
        (re.compile(r"\b(?:urban|inner[- ]city)\s+(?:youth|teens|kids|children)\b", re.I), 0.65, "Potentially coded language for racial groups"),
        (re.compile(r"\b(?:the\s+)?(?:crime|dropout|unemployment|poverty)\s+rate\s+is\s+(?:higher|worse|greater)\s+(?:because|due|as a result)\s+(?:of|from)\s+(?:the\s+)?(?:certain|specific|these|those|these)\s+(?:ethnicit|population|communit|group|race)\b", re.I), 0.80, "Attributing social issues to ethnic/racial groups"),
        (re.compile(r"\b(?:these|those|the)\s+(?:ethnicit|population|communit|group|race)s?\s+(?:are|have|tend|commit|cause)\b", re.I), 0.75, "Generalizing behavior to ethnic/racial groups"),
    ]

    # ─── Age Bias ───────────────────────────────────────────────────────────
    AGE_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        # Direct age discrimination
        (re.compile(r"\b(?:too old|over the hill|past (?:their|his|her) prime|getting on|aged out)\b", re.I), 0.85, "Age-discriminatory language"),
        (re.compile(r"\b(?:too young|not mature enough|just a kid|wet behind the ears|green)\b", re.I), 0.80, "Age-dismissive language"),
        (re.compile(r"\b(?:digital native|tech-savvy)\b.*\b(?:young|millennial|gen ?z)\b", re.I), 0.60, "Assuming technology skills correlate with age"),
        (re.compile(r"\b(?:senior|older|elderly)\s+(?:worker|employee|candidate|person)\b.*\b(?:slow|resist|outdated|inflexible|can't learn|unable to adapt)\b", re.I), 0.80, "Age stereotyping in employment context"),
        (re.compile(r"\b(?:young|junior|fresh)\s+(?:and|but)\s+(?:inexperienced|immature|unreliable|naive)\b", re.I), 0.70, "Age-based generalization about capability"),
        (re.compile(r"\b(?:young|elderly|older)\s+(?:people|person|workers?|candidates?)\s+(?:can'?t|cannot|don'?t|doesn'?t|won'?t|wouldn'?t|aren'?t)\s+(?:understand|handle|cope|adapt|learn|do)\b", re.I), 0.80, "Age-based capability dismissal"),
        # Generational stereotyping
        (re.compile(r"\b(?:millennials?|gen ?z|boomers?|gen ?x)\s+(?:are all|always|never|tend to|typically)\b", re.I), 0.70, "Generational stereotyping"),
        (re.compile(r"\b(?:entitled|lazy|snowflake|participation trophy)\b.*\b(?:millennial|gen ?z|young)\b", re.I), 0.75, "Age-based derogatory generalization"),
        (re.compile(r"\b(?:set in (?:their|his|her) ways|can't teach an old dog)\b", re.I), 0.65, "Age-based assumption about adaptability"),
        # Age-based hiring bias
        (re.compile(r"\b(?:prefer|looking for)\s+(?:a\s+)?(?:young|energetic|fresh|dynamic|recent graduate|cultural fit)\b", re.I), 0.70, "Age-coded hiring language"),
        (re.compile(r"\b(?:overqualified|underqualified)\s+(?:for\s+)?(?:their|his|her)\s+(?:age|years)\b", re.I), 0.65, "Age-based qualification assessment"),
    ]

    # ─── Confirmation Bias ──────────────────────────────────────────────────
    CONFIRMATION_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:obviously|clearly|of course|naturally|as expected|needless to say)\b", re.I), 0.50, "Presenting conclusions as self-evident may indicate confirmation bias"),
        (re.compile(r"\b(?:this (?:proves|confirms|validates|demonstrates) (?:that|what|our))\b", re.I), 0.65, "Claiming single evidence 'proves' a conclusion"),
        (re.compile(r"\b(?:the only (?:explanation|reason|conclusion|possibility))\b", re.I), 0.70, "Presenting one viewpoint as the only possibility"),
        (re.compile(r"\b(?:anyone (?:can see|would agree|knows|with eyes))\b", re.I), 0.60, "Universalizing a particular perspective"),
        (re.compile(r"\b(?:it(?:'s| is) (?:just |plainly )?(?:obvious|clear|evident|undeniable) that)\b", re.I), 0.55, "Asserting self-evidence of a claim"),
        (re.compile(r"\b(?:I knew (?:it|this|that)|see,?\s+(?:I|as I))\b", re.I), 0.50, "Vindicating one's own prior belief"),
        (re.compile(r"\b(?:as (?:I|we) (?:said|knew|predicted|expected))\b", re.I), 0.55, "Claiming prior knowledge as validation"),
    ]

    # ─── Geographic/Cultural Bias ───────────────────────────────────────────
    GEOGRAPHIC_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:in (?:the )?(?:West|Western (?:world|countries|nations|society|values|culture)))\b.*\b(?:better|superior|advanced|civilized|progressive|enlightened)\b", re.I), 0.75, "Western-centric bias implying cultural superiority"),
        (re.compile(r"\b(?:normal|standard|typical|default)\b.*\b(?:American|Western|European)\b", re.I), 0.65, "Treating one culture as the universal standard"),
        (re.compile(r"\b(?:backward|primitive|uncivilized|undeveloped|regressive)\s+(?:culture|society|country|nation|people)\b", re.I), 0.80, "Culturally pejorative descriptions"),
        (re.compile(r"\b(?:not\s+(?:as|like)\s+(?:us|we)\s+(?:are|do|think))\b", re.I), 0.60, "In-group/out-group cultural bias"),
        (re.compile(r"\b(?:first[- ]world|developed)\s+(?:country|nation|world|countries)\b.*\b(?:better|superior|more advanced)\b", re.I), 0.75, "Development-based cultural hierarchy"),
        (re.compile(r"\b(?:third[- ]world|developing|underdeveloped)\s+(?:country|nation|world|countries)\b.*\b(?:worse|inferior|less advanced|backward)\b", re.I), 0.80, "Development-based cultural hierarchy"),
        (re.compile(r"\b(?:their culture|that culture|that society)\s+(?:is|are|does|values|believes)\s+(?:wrong|inferior|backward|primitive)\b", re.I), 0.85, "Cultural supremacism"),
        (re.compile(r"\b(?:civilized|developed|advanced|modern)\s+(?:world|society|nation|country)\b", re.I), 0.55, "Potentially ethnocentric terminology"),
    ]

    def detect(self, text: str) -> DetectionResult:
        """Run all bias pattern checks against input text."""
        start = time.perf_counter()
        spans: list[DetectedSpan] = []

        pattern_groups = [
            ("gender", self.GENDER_BIAS),
            ("racial", self.RACIAL_BIAS),
            ("age", self.AGE_BIAS),
            ("confirmation", self.CONFIRMATION_BIAS),
            ("geographic", self.GEOGRAPHIC_BIAS),
        ]

        for group_name, patterns in pattern_groups:
            for pattern, confidence, recommendation in patterns:
                for match in pattern.finditer(text):
                    ctx_start = max(0, match.start() - 60)
                    ctx_end = min(len(text), match.end() + 60)
                    spans.append(DetectedSpan(
                        start=match.start(),
                        end=match.end(),
                        category=DetectionCategory.BIAS,
                        confidence=confidence,
                        matched_text=match.group()[:80],
                        detector=f"bias_{group_name}",
                        context=f"{recommendation} | {text[ctx_start:ctx_end]}",
                    ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_conf = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="bias",
            spans=spans,
            risk_score=max_conf * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
