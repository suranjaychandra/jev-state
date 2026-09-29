# jev-state benchmark

- Model: `jev-1.13.0`
- Date: 2026-09-29
- 70 seeded NPC scenarios (10 per action, seed 42) x 3 reruns x 2 variants = 420 calls
- Same instructions and options for both variants; only the state differs.
- Total input tokens: 406,326 (about $0.0171)

| | Raw state | jev-state |
|---|---|---|
| Accuracy | 74.3% | 100.0% |
| Scenarios whose answer changed across reruns | 6/70 | 0/70 |
| Avg input tokens | 1236 | 699 |
| p50 latency | 336 ms | 335 ms |
| p95 latency | 422 ms | 390 ms |
| Errors | 0 | 0 |

## Accuracy by expected action

| Action | Raw | jev-state |
|---|---|---|
| retreat | 50.0% | 100.0% |
| take_cover | 100.0% | 100.0% |
| heal | 60.0% | 100.0% |
| reload | 90.0% | 100.0% |
| attack | 86.7% | 100.0% |
| investigate | 90.0% | 100.0% |
| patrol | 43.3% | 100.0% |

## Confidence vs. accuracy

When Jev reports a confidence, how often is it right?

| Confidence | Raw: n / avg conf / accuracy | jev-state: n / avg conf / accuracy |
|---|---|---|
| 0–0.5 | 38 / 41.2% / 28.9% | 0 |
| 0.5–0.7 | 32 / 58.3% / 56.3% | 3 / 66.0% / 100.0% |
| 0.7–0.9 | 70 / 81.7% / 81.4% | 29 / 81.3% / 100.0% |
| 0.9–1 | 70 / 95.8% / 100.0% | 178 / 98.9% / 100.0% |
