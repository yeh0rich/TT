# Eval report

Model: `claude-haiku-4-5-20251001`. Factual accuracy and citation accuracy graded separately per the brief.

- **Factual accuracy**: 100% (6 graded questions)
- **Citation accuracy**: 100% (6 graded questions)
- **Median question→answer latency**: 3569 ms (min 1050 / max 8510 ms), measured wall-clock from request sent to full answer received
- **Average cost per question**: $0.00285 (graded questions only)
- **Total session cost** (6 graded + 2 context-setup questions): $0.02272
- **Ingestion**: d200_v1: 4 pages in 12 ms server-side (no LLM call - $0 ingestion cost); d200_v2: 4 pages in 13 ms server-side (no LLM call - $0 ingestion cost); d400_v1: 4 pages in 10 ms server-side (no LLM call - $0 ingestion cost)

| Question | Graded | Text | found | factual / citation | latency | cost |
|---|---|---|---|---|---|---|
| q1_direct_fact | yes | What is the maximum coverage area of the D200? | true | ✅ / ✅ | 3569 ms | $0.00265 |
| q2_comparison | yes | How does the maximum coverage area of the D200 compare to the D400? | true | ✅ / ✅ | 1783 ms | $0.00298 |
| q3a_setup_context | no | What are the setup steps for the D200? | true | (context only) | 8510 ms | $0.00379 |
| q3b_followup | yes | And what about the other model? | true | ✅ / ✅ | 4068 ms | $0.00404 |
| q4_exception | yes | Can the D200 be used at an ambient temperature of 0 degrees Celsius? | true | ✅ / ✅ | 1791 ms | $0.00302 |
| q5_absent_fact | yes | What is the warranty period for the D400? | false | ✅ / ✅ | 2941 ms | $0.00234 |
| q6a_before_replace | no | What is the internal tank capacity of the D200? | true | (context only) | 1050 ms | $0.00184 |
| q6b_after_replace | yes | What is the internal tank capacity of the D200? | true | ✅ / ✅ | 4760 ms | $0.00207 |

Full transcripts, citations and token usage: see `results.json`.
