# ADR-0005: Show a shortlist, not a long list, and let buyers chat with it

- Status: Accepted (owner direction, 2026-10-28)
- Date: 2026-10-28

## Context
Owner's direction: buyers should not be flooded with hundreds of options. They should get a
small set and be able to talk to the results to filter, compare, and pick the best.

## Decision
1. Research stays wide behind the scenes (100+ candidates), but the buyer first sees a
   **shortlist of the top 10**, each with a one-line reason and its strongest evidence.
2. The full list stays one click away ("See all N checked companies"), never the default.
3. An **Advisor chat** sits beside the shortlist. It can:
   - filter and re-rank ("only Texas", "drop anyone under 20 years old"),
   - compare ("compare #2 and #5 on customers and accreditations"),
   - explain ("why is #3 ranked above #4?"),
   - pin, hide, or move companies on the shortlist,
   - start a **deep dive** on a company (Tavily Research), after showing the credit cost and asking.
4. **Grounding rule:** the Advisor answers only from collected evidence. Every factual sentence
   cites a fact id; the server checks each cited id exists for that company. If the evidence
   doesn't cover a question, it says so and offers a deep dive instead of guessing.
5. The Advisor acts through typed tools (filter, rank, compare, pin, deepDive). It cannot run
   arbitrary queries, see other workspaces, or spend credits without user confirmation.

## Consequences
- The shortlist quality becomes the product's core promise, so ranking gets its own tests.
- Chat adds LLM cost per message; it is metered and capped per workspace like Tavily credits.
- Chat history is customer data: stored per workspace, never sent to Tavily.
