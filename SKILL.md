---
name: prospect-radar
version: 3.0.0
description: >
  Production B2B/B2C prospect intelligence skill. Finds lookalike companies
  and decision-makers using Exa.ai real-time web crawlers + Claude ICP analysis.
  Batches of 25, deduplicated, up to 1000/session. No static databases.
requires:
  - exa_api_key: Exa.ai API key (exa.ai)
  - anthropic_api_key: Anthropic API key (console.anthropic.com)
---

# ProspectRadar Skill — Exa.ai + Claude Pipeline

## Trigger phrases
- "Find companies like [company]"
- "Lookalikes for [domain]"
- "Who are [company]'s competitors in [segment]?"
- "Find [role] at [industry] companies in [geo]"
- "Next 25" / "More results"
- "Find B2B SaaS companies with 50-200 employees selling to HR teams"

---

## Pipeline (9 steps)

```
INPUT: seed domain or NL query
    ↓
[1] EXA SEARCH seed domain
    → GET: page text, title, url
    ↓
[2] CLAUDE extract ICP (structured JSON)
    → GET: industry, size, model, segment, pain points, tech signals
    ↓
[3] EXA findSimilar(seed URL)
    → GET: 15-20 similar company URLs + text snippets
    ↓
[4] EXA search × 4-5 queries (parameterised by ICP)
    → GET: more candidate URLs from different angles
    ↓
[5] EXA contents (crawl top candidates)
    → GET: full page text for enrichment
    ↓
[6] CLAUDE score all candidates vs ICP
    → GET: fit_score 1-10, why_fit, signals, outreach_hook per candidate
    ↓
[7] DEDUPE by domain (cross-session)
    → FILTER: remove already-seen, below-threshold
    ↓
[8] SLICE batch of 25
    ↓
[9] OUTPUT structured JSON + offer Next 25
```

---

## Exa.ai API calls

```javascript
// 1. Search for seed company
POST https://api.exa.ai/search
{ "query": "stripe.com company overview", "type": "neural", "numResults": 5,
  "contents": { "text": { "maxCharacters": 1500 } } }

// 2. Find similar pages to seed URL
POST https://api.exa.ai/findSimilar
{ "url": "https://stripe.com", "numResults": 20,
  "excludeDomains": ["already-found.com"],
  "contents": { "text": { "maxCharacters": 1500 } } }

// 3. Semantic search with ICP-derived queries
POST https://api.exa.ai/search
{ "query": "payments API fintech startup Series B Europe",
  "type": "neural", "numResults": 10,
  "contents": { "text": { "maxCharacters": 1500 } } }

// 4. Crawl candidate pages
POST https://api.exa.ai/contents
{ "ids": ["id1","id2",...], "text": { "maxCharacters": 2000 } }
```

Authentication: `x-api-key: YOUR_EXA_KEY` header on all calls.

---

## ICP Schema (output of Step 2)

```json
{
  "company_name": "Stripe",
  "domain": "stripe.com",
  "industry": "Fintech / Payments",
  "sub_vertical": "Payments Infrastructure",
  "hq": "San Francisco, CA",
  "size_band": "5000+ employees",
  "funding_stage": "Late Stage / Public-ready",
  "business_model": "B2B API Platform",
  "customer_segment": "SMB + Enterprise",
  "key_products": ["Payments API", "Stripe Connect", "Billing"],
  "pain_points_solved": ["slow payment integration", "compliance", "multi-currency"],
  "tech_signals": ["Ruby", "AWS", "React"],
  "growth_signals": ["Hiring 200+ engineers", "Expanding APAC"],
  "ideal_lookalike": {
    "industry": "Fintech / Payments",
    "size": "50-2000 employees",
    "geo": "Global / EU / APAC",
    "model": "B2B API / Developer-first",
    "stage": "Series A-D",
    "titles": ["VP Engineering", "CTO", "Head of Payments"]
  }
}
```

---

## Prospect Output Schema (per result)

```json
{
  "rank": 1,
  "fit_score": 9,
  "name": "Adyen",
  "website": "https://adyen.com",
  "linkedin": "https://linkedin.com/company/adyen",
  "hq": "Amsterdam, Netherlands",
  "size": "3000-5000 employees",
  "industry": "Fintech / Payments",
  "stage": "Public",
  "founding_year": "2006",
  "business_model": "B2B Payments Platform",
  "customer_segment": "Enterprise + SMB",
  "fit_score": 9,
  "why_fit": "Direct payments infrastructure lookalike; developer-first API model; same enterprise + SMB dual segment; public company with strong growth signals in APAC.",
  "signals": ["Acquired 2 fintech startups 2024", "Hiring 50 engineers APAC", "Launched India operations"],
  "target_role": "VP Engineering",
  "outreach_hook": "Your APAC expansion mirrors Stripe's playbook — our infrastructure layer cuts integration time by 60% for payments teams at your scale.",
  "key_products": ["Payments API", "Terminal", "Issuing"],
  "tech_stack": ["Java", "AWS", "Kubernetes"],
  "source_url": "https://adyen.com/about"
}
```

---

## Session State

```
session = {
  seedUrl: str,
  seedProfile: ICP,
  alreadyDomains: Set<str>,
  queriesUsed: List<str>,
  batchNum: int,
  totalFound: int (max 1000),
  allResults: List<Prospect>
}
```

---

## Query Generation Rules

For each batch, generate 4-5 queries from DIFFERENT angles:

| Angle | Example |
|---|---|
| Industry + model + geo | "fintech payments API startup Europe Series B" |
| Customer segment + pain | "payments platform SMB compliance integration" |
| Hiring signal | "fintech startup hiring engineers payments infrastructure" |
| Funding signal | "payments company raised funding Series B 2024" |
| Competitor displacement | "Stripe alternative payments API developer-first" |
| Tech stack | "Ruby AWS payments platform fintech" |

Never repeat a query used in a previous batch.

---

## Token Efficiency (Caveman Protocol)

Internal reasoning: drop articles/filler, keep substance.
- ❌ "I would like to suggest searching for companies that might be similar to..."
- ✅ "search: payments API fintech EU Series B"

Claude scoring call: compact candidate list (400 chars per candidate).
Each scoring batch: ~30 candidates → ~3500 input tokens → ~2000 output tokens.

---

## Edge Cases

| Situation | Handling |
|---|---|
| Domain not crawlable by Exa | Falls back to search-based discovery |
| findSimilar returns 0 | Skip, use search-only pipeline |
| < 25 after dedup | Return partial + suggest filter relaxation |
| All below min-score | Suggest lowering threshold to 3 |
| Session cap (1000) | Export prompt + reset option |
| Overloaded API | Auto-retry 3x with exponential backoff |
| NL query (no domain) | Skip findSimilar, extract ICP from search results |
| Ambiguous seed | Ask 1 clarifying question + show top 3 interpretations |
| Person mode | Include: name, title, company, LinkedIn, email signal |
| Company + Person both | Return mixed batch, labelled by type |

---

## Claude Code Install

```bash
claude install-skill ./SKILL.md
```

Trigger: "Find companies like intercom.com in Europe, Series A-B, 50-200 employees"
