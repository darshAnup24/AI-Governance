# ShieldAI Model Evaluation Report
Generated at: 2026-04-19 13:08:03
## Test Set Metrics
Categories: `SAFE` · `PII` · `CREDENTIALS` · `PROMPT_INJECTION` · `HALLUCINATION` · `BIAS` · `REGULATORY`
### sklearn TF-IDF + Logistic Regression
| Category | Precision | Recall | F1 | Support | Status |
|---|---|---|---|---|---|
| **SAFE** | 1.000 | 0.667 | 0.800 | 6 | ✅ |
| **PII** | 1.000 | 0.250 | 0.400 | 12 | ❌ |
| **CREDENTIALS** | 1.000 | 1.000 | 1.000 | 9 | ✅ |
| **PROMPT_INJECTION** | 1.000 | 1.000 | 1.000 | 10 | ✅ |
| **HALLUCINATION** | 1.000 | 0.571 | 0.727 | 7 | 🟡 |
| **BIAS** | 1.000 | 0.667 | 0.800 | 6 | ✅ |
| **REGULATORY** | 0.833 | 0.714 | 0.769 | 14 | 🟡 |

| **Micro F1** | | | **0.8000** | | |
| **Macro F1** | | | **0.7852** | | |
| **Weighted F1** | | | **0.7697** | | |

### spaCy textcat_multilabel (BOW)
| Category | Precision | Recall | F1 | Support | Status |
|---|---|---|---|---|---|
| **SAFE** | 1.000 | 1.000 | 1.000 | 6 | ✅ |
| **PII** | 1.000 | 0.500 | 0.667 | 12 | 🟡 |
| **CREDENTIALS** | 1.000 | 0.889 | 0.941 | 9 | ✅ |
| **PROMPT_INJECTION** | 1.000 | 1.000 | 1.000 | 10 | ✅ |
| **HALLUCINATION** | 0.500 | 0.571 | 0.533 | 7 | ❌ |
| **BIAS** | 1.000 | 0.500 | 0.667 | 6 | 🟡 |
| **REGULATORY** | 0.733 | 0.786 | 0.759 | 14 | 🟡 |

| **Micro F1** | | | **0.8000** | | |
| **Macro F1** | | | **0.7952** | | |
| **Weighted F1** | | | **0.7941** | | |

## Legend
- ✅ F1 ≥ 0.80 — production ready
- 🟡 F1 0.60–0.79 — needs improvement
- ❌ F1 < 0.60 — insufficient data or model

## Next Steps
- Add more labeled examples for low-F1 categories
- Re-run `python detection/ml/scripts/train.py`
- Consider fine-tuning `en_core_web_trf` for production
