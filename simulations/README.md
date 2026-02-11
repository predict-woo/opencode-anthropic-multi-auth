# Quota Policy Simulations

This folder contains a Monte Carlo simulator that compares multi-account selection policies for Anthropic quota balancing.

The simulator models:
- Multiple accounts with independent 5-hour and 7-day quotas.
- Random reset offsets per account for both windows.
- Randomized demand profiles with peak-hour load and burst periods.
- Focused-mode evening spikes plus constrained-vs-roomy weekly pools to avoid trivial all-accounts-saturated outcomes.
- Auto-migration behavior when the first selected account is 5-hour exhausted.

## Policies Compared

The script evaluates at least four policies:
- `five_hour_first` (baseline): prioritize highest remaining 5-hour headroom.
- `seven_day_first`: prioritize highest remaining 7-day headroom.
- `weighted_score`: weighted 7-day + 5-hour + reset urgency.
- `reset_aware_weekly_priority`: weekly-priority policy with reset-aware adjustments and 5-hour guardrails.
- `reset_stagger_pressure`: reset-stagger-aware policy that spends earlier-reset weekly pools while guarding 5-hour failover under low-account pressure.
- `reset_near_expiry_reserve`: stronger challenger that opportunistically spends near-weekly-reset accounts while reserving useful 5-hour headroom during peak periods.

## Usage

From repository root:

```bash
python3 simulations/simulate_quota_policies.py
```

Optional arguments:

```bash
python3 simulations/simulate_quota_policies.py --trials 2000 --seed 42 --output-dir simulations/results
```

Focused heterogeneous-reset comparison (recommended for low-account/high-user analysis):

```bash
python3 simulations/simulate_quota_policies.py --trials 200 --scenario-mode focused --reset-mode mixed
```

Defaults:
- `--trials 1000`
- `--seed 20260211`
- `--output-dir simulations/results`
- `--scenario-mode focused`
- `--reset-mode mixed`

## Output Artifacts

Each run writes:
- Timestamped summary JSON: `simulations/results/summary-<timestamp>.json`
- Timestamped per-trial CSV: `simulations/results/trial-metrics-<timestamp>.csv`
- Timestamped report: `simulations/results/report-<timestamp>.md`
- Latest pointers:
  - `simulations/results/latest_summary.json`
  - `simulations/results/latest_trial_metrics.csv`
  - `simulations/results/latest_report.md`

The ranking objective rewards:
- Total served demand.
- Peak-time served demand.
- Peak useful 5-hour reserve (fraction of accounts that can still serve non-trivial requests during peak windows).
- Migration recovery when 5-hour exhaustion triggers failover.
- Mean weekly utilization.

And penalizes:
- Denial/outage rate.
- Weekly fairness drift across accounts.

The console output prints the best policy by objective score and locations of generated artifacts.

The summary JSON and markdown report also include:
- Ranking split by reset class (`same_reset` vs `staggered_reset`).
- Head-to-head comparison (`reset_near_expiry_reserve` vs `seven_day_first`) with per-class win counts and objective delta.

## Latest Focused 200-Trial Recommendation Run

Command:

```bash
python3 simulations/simulate_quota_policies.py --trials 200 --scenario-mode focused --reset-mode mixed
```

Latest findings (from `simulations/results/latest_report.md`):
- Winner remains `seven_day_first`.
- In `staggered_reset`, challenger `reset_near_expiry_reserve` does **not** beat baseline; average objective delta (challenger - baseline) is negative.
- Updated focused-mode assumptions produce non-trivial utilization/denial tradeoffs, so policies are now distinguishable beyond identical full-week saturation.
