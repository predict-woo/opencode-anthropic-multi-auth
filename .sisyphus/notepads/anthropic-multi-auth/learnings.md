## Learnings


- 2026-02-11: Continuation run confirmed implementation completion and synchronized plan checkbox state to fully checked.
- 2026-02-11: Monte Carlo quota simulation in `simulations/simulate_quota_policies.py` showed weekly-prioritized policies outperform 5h-first on composite objective, with `seven_day_first` ranking best over 1000 randomized trials and independent 5h/7d reset offsets.
- 2026-02-11: Added focused low-account/high-user scenario mode and reset-class slicing (same_reset vs staggered_reset) in the simulator, plus a new reset-stagger-aware policy () and per-class head-to-head reporting against  for 200-trial recommendation runs.
- 2026-02-11: Follow-up note: the new policy is named reset_stagger_pressure and its head-to-head baseline is seven_day_first; focused 200-trial outputs now include per-reset-class rankings and win counts.
- 2026-02-11: Clarification for prior malformed placeholder line: the missing names are `reset_stagger_pressure` (challenger policy) and `seven_day_first` (baseline) in that first reset-class head-to-head addition.
- 2026-02-11: Second-pass redesign added `reset_near_expiry_reserve`, peak useful 5h reserve in objective scoring, and focused-mode capacity/demand heterogeneity; in the 200-trial mixed-reset focused run, `seven_day_first` still wins including staggered_reset (avg challenger delta -0.0246 objective).
- 2026-02-11: Quota selector now prioritizes `seven_day.utilization` and only falls back to `five_hour.utilization` when weekly data is absent, matching the simulation-backed weekly-first policy.
