#!/usr/bin/env python3
# pyright: reportDeprecated=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnusedCallResult=false
"""Monte Carlo simulation for multi-account Anthropic quota balancing policies."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Literal, Sequence, TypedDict


FIVE_HOURS_MINUTES = 5 * 60
SEVEN_DAYS_MINUTES = 7 * 24 * 60
MAX_RANDOM_SEED = 2_147_483_647


class RankingRow(TypedDict):
    policy: str
    trials: float
    served_ratio_mean: float
    peak_served_ratio_mean: float
    denial_rate_mean: float
    migration_recovery_mean: float
    peak_useful_five_hour_mean: float
    weekly_drift_mean: float
    mean_seven_day_utilization_mean: float
    objective_score_mean: float
    rank: float


@dataclass(frozen=True)
class RunArtifacts:
    timestamp: str
    summary: List[RankingRow]
    json_path: str
    latest_json: str
    csv_path: str
    latest_csv: str
    report_path: str
    latest_report: str


@dataclass(frozen=True)
class ScenarioConfig:
    account_count: int
    user_count: int
    scenario_mode: str
    reset_pattern: str
    base_lambda_per_user: float
    peak_multiplier: float
    weekend_multiplier: float
    burst_start_minute: int
    burst_duration_minutes: int
    burst_multiplier: float
    evening_spike_multiplier: float
    request_cost_min: int
    request_cost_max: int


@dataclass
class AccountState:
    index: int
    five_hour_capacity: int
    seven_day_capacity: int
    five_hour_used: int
    seven_day_used: int
    five_hour_next_reset: int
    seven_day_next_reset: int

    def reset_if_needed(self, minute: int) -> None:
        while minute >= self.five_hour_next_reset:
            self.five_hour_used = 0
            self.five_hour_next_reset += FIVE_HOURS_MINUTES
        while minute >= self.seven_day_next_reset:
            self.seven_day_used = 0
            self.seven_day_next_reset += SEVEN_DAYS_MINUTES

    def remaining_five_hour(self) -> int:
        return max(0, self.five_hour_capacity - self.five_hour_used)

    def remaining_seven_day(self) -> int:
        return max(0, self.seven_day_capacity - self.seven_day_used)

    def can_serve(self, cost: int) -> bool:
        return self.remaining_five_hour() >= cost and self.remaining_seven_day() >= cost

    def consume(self, cost: int) -> None:
        self.five_hour_used += cost
        self.seven_day_used += cost


@dataclass
class TrialMetrics:
    policy: str
    trial_id: int
    scenario_mode: str
    reset_pattern: str
    account_count: int
    user_count: int
    total_demand: int
    served_demand: int
    denied_demand: int
    peak_total_demand: int
    peak_served_demand: int
    migrated_requests: int
    migration_successes: int
    peak_useful_five_hour: float
    weekly_drift: float
    mean_seven_day_utilization: float
    objective_score: float

    def as_dict(self) -> Dict[str, float | int | str]:
        return {
            "policy": self.policy,
            "trial_id": self.trial_id,
            "scenario_mode": self.scenario_mode,
            "reset_pattern": self.reset_pattern,
            "account_count": self.account_count,
            "user_count": self.user_count,
            "total_demand": self.total_demand,
            "served_demand": self.served_demand,
            "denied_demand": self.denied_demand,
            "peak_total_demand": self.peak_total_demand,
            "peak_served_demand": self.peak_served_demand,
            "migrated_requests": self.migrated_requests,
            "migration_successes": self.migration_successes,
            "peak_useful_five_hour": self.peak_useful_five_hour,
            "weekly_drift": self.weekly_drift,
            "mean_seven_day_utilization": self.mean_seven_day_utilization,
            "objective_score": self.objective_score,
        }


def poisson_sample(rng: random.Random, lam: float) -> int:
    if lam <= 0.0:
        return 0
    if lam > 40.0:
        return max(0, int(rng.gauss(lam, math.sqrt(lam))))
    threshold = math.exp(-lam)
    k = 0
    p = 1.0
    while p > threshold:
        k += 1
        p *= rng.random()
    return k - 1


def is_peak_minute(minute: int) -> bool:
    minute_of_day = minute % (24 * 60)
    return 8 * 60 <= minute_of_day < 22 * 60


def is_evening_peak_minute(minute: int) -> bool:
    minute_of_day = minute % (24 * 60)
    return 18 * 60 <= minute_of_day < 22 * 60


def minute_intensity_multiplier(config: ScenarioConfig, minute: int) -> float:
    day_index = (minute // (24 * 60)) % 7
    weekend = day_index in (5, 6)
    multiplier = config.peak_multiplier if is_peak_minute(minute) else 1.0
    if weekend:
        multiplier *= config.weekend_multiplier
    in_burst = config.burst_start_minute <= minute < (
        config.burst_start_minute + config.burst_duration_minutes
    )
    if in_burst:
        multiplier *= config.burst_multiplier
    if is_evening_peak_minute(minute):
        multiplier *= config.evening_spike_multiplier
    return multiplier


def utilization_ratio(used: int, capacity: int) -> float:
    if capacity <= 0:
        return 1.0
    return max(0.0, min(1.0, used / capacity))


def remaining_ratio(remaining: int, capacity: int) -> float:
    if capacity <= 0:
        return 0.0
    return max(0.0, min(1.0, remaining / capacity))


def time_to_reset_ratio(now: int, next_reset: int, window_minutes: int) -> float:
    remaining_minutes = max(0, next_reset - now)
    return max(0.0, min(1.0, remaining_minutes / window_minutes))


def policy_five_hour_first(accounts: Sequence[AccountState], now: int) -> List[int]:
    del now
    scored = []
    for account in accounts:
        rem5 = remaining_ratio(account.remaining_five_hour(), account.five_hour_capacity)
        rem7 = remaining_ratio(account.remaining_seven_day(), account.seven_day_capacity)
        score = (1.00 * rem5) + (0.10 * rem7)
        scored.append((score, account.index))
    scored.sort(reverse=True)
    return [index for _, index in scored]


def policy_seven_day_first(accounts: Sequence[AccountState], now: int) -> List[int]:
    del now
    scored = []
    for account in accounts:
        rem7 = remaining_ratio(account.remaining_seven_day(), account.seven_day_capacity)
        rem5 = remaining_ratio(account.remaining_five_hour(), account.five_hour_capacity)
        score = (1.00 * rem7) + (0.10 * rem5)
        scored.append((score, account.index))
    scored.sort(reverse=True)
    return [index for _, index in scored]


def policy_weighted_score(accounts: Sequence[AccountState], now: int) -> List[int]:
    scored = []
    for account in accounts:
        rem7 = remaining_ratio(account.remaining_seven_day(), account.seven_day_capacity)
        rem5 = remaining_ratio(account.remaining_five_hour(), account.five_hour_capacity)
        reset7_urgency = 1.0 - time_to_reset_ratio(
            now, account.seven_day_next_reset, SEVEN_DAYS_MINUTES
        )
        reset5_urgency = 1.0 - time_to_reset_ratio(
            now, account.five_hour_next_reset, FIVE_HOURS_MINUTES
        )
        score = (0.60 * rem7) + (0.30 * rem5) + (0.06 * reset7_urgency) + (0.04 * reset5_urgency)
        scored.append((score, account.index))
    scored.sort(reverse=True)
    return [index for _, index in scored]


def policy_reset_aware_weekly_priority(accounts: Sequence[AccountState], now: int) -> List[int]:
    scored = []
    for account in accounts:
        rem7 = remaining_ratio(account.remaining_seven_day(), account.seven_day_capacity)
        rem5 = remaining_ratio(account.remaining_five_hour(), account.five_hour_capacity)
        reset7_urgency = 1.0 - time_to_reset_ratio(
            now, account.seven_day_next_reset, SEVEN_DAYS_MINUTES
        )
        reset5_ratio = time_to_reset_ratio(now, account.five_hour_next_reset, FIVE_HOURS_MINUTES)
        five_hour_guardrail = -0.20 if rem5 < 0.08 and reset5_ratio > 0.50 else 0.0
        score = (0.72 * rem7) + (0.16 * rem5) + (0.12 * reset7_urgency) + five_hour_guardrail
        scored.append((score, account.index))
    scored.sort(reverse=True)
    return [index for _, index in scored]


def policy_reset_stagger_pressure(accounts: Sequence[AccountState], now: int) -> List[int]:
    if not accounts:
        return []

    account_count = len(accounts)
    reset_time_ratios = [
        time_to_reset_ratio(now, account.seven_day_next_reset, SEVEN_DAYS_MINUTES)
        for account in accounts
    ]
    reset_spread = max(reset_time_ratios) - min(reset_time_ratios)
    reset_pressure = 0.10 + (0.35 * reset_spread)
    high_pressure_guard = 0.15 if account_count <= 3 else 0.07

    ranked_by_earliest_reset = sorted(
        accounts,
        key=lambda account: account.seven_day_next_reset,
    )
    earliest_rank: Dict[int, int] = {
        account.index: rank for rank, account in enumerate(ranked_by_earliest_reset)
    }

    scored = []
    for account in accounts:
        rem7 = remaining_ratio(account.remaining_seven_day(), account.seven_day_capacity)
        rem5 = remaining_ratio(account.remaining_five_hour(), account.five_hour_capacity)
        reset7_ratio = time_to_reset_ratio(now, account.seven_day_next_reset, SEVEN_DAYS_MINUTES)
        reset5_ratio = time_to_reset_ratio(now, account.five_hour_next_reset, FIVE_HOURS_MINUTES)
        reset7_urgency = 1.0 - reset7_ratio
        earliest_reset_bias = 1.0 - (earliest_rank[account.index] / max(1, account_count - 1))

        five_hour_risk = 1.0 if rem5 < 0.10 and reset5_ratio > 0.40 else 0.0
        guardrail_penalty = high_pressure_guard * five_hour_risk

        score = (
            (0.45 * rem7)
            + (0.23 * rem5)
            + (reset_pressure * reset7_urgency)
            + (0.15 * earliest_reset_bias)
            - guardrail_penalty
        )
        scored.append((score, account.index))

    scored.sort(reverse=True)
    return [index for _, index in scored]


def policy_reset_near_expiry_reserve(accounts: Sequence[AccountState], now: int) -> List[int]:
    if not accounts:
        return []

    account_count = len(accounts)
    low_account_pressure = account_count <= 3
    peak_now = is_peak_minute(now)

    sorted_by_reset = sorted(accounts, key=lambda account: account.seven_day_next_reset)
    reset_rank: Dict[int, int] = {
        account.index: rank for rank, account in enumerate(sorted_by_reset)
    }

    scored = []
    for account in accounts:
        rem7 = remaining_ratio(account.remaining_seven_day(), account.seven_day_capacity)
        rem5 = remaining_ratio(account.remaining_five_hour(), account.five_hour_capacity)
        reset7_ratio = time_to_reset_ratio(now, account.seven_day_next_reset, SEVEN_DAYS_MINUTES)
        reset5_ratio = time_to_reset_ratio(now, account.five_hour_next_reset, FIVE_HOURS_MINUTES)
        reset7_urgency = 1.0 - reset7_ratio
        earlier_reset_bias = 1.0 - (reset_rank[account.index] / max(1, account_count - 1))

        reserve_target = 0.18 if low_account_pressure else 0.12
        reserve_shortfall = max(0.0, reserve_target - rem5)
        reserve_penalty = (0.36 if peak_now else 0.18) * reserve_shortfall
        if reset5_ratio < 0.14 and rem5 < 0.12:
            reserve_penalty *= 0.25

        near_expiry_spend_bonus = (0.38 * reset7_urgency) + (0.22 * earlier_reset_bias)
        if peak_now:
            near_expiry_spend_bonus *= 0.72

        score = (0.40 * rem7) + (0.30 * rem5) + near_expiry_spend_bonus - reserve_penalty
        scored.append((score, account.index))

    scored.sort(reverse=True)
    return [index for _, index in scored]


POLICIES: Dict[str, Callable[[Sequence[AccountState], int], List[int]]] = {
    "five_hour_first": policy_five_hour_first,
    "seven_day_first": policy_seven_day_first,
    "weighted_score": policy_weighted_score,
    "reset_aware_weekly_priority": policy_reset_aware_weekly_priority,
    "reset_stagger_pressure": policy_reset_stagger_pressure,
    "reset_near_expiry_reserve": policy_reset_near_expiry_reserve,
}


def choose_reset_pattern(
    rng: random.Random,
    reset_mode: Literal["mixed", "same", "staggered"],
) -> str:
    if reset_mode == "same":
        return "same_reset"
    if reset_mode == "staggered":
        return "staggered_reset"
    return "same_reset" if rng.random() < 0.5 else "staggered_reset"


def create_scenario_config(
    rng: random.Random,
    scenario_mode: Literal["broad", "focused"],
    reset_mode: Literal["mixed", "same", "staggered"],
) -> ScenarioConfig:
    if scenario_mode == "focused":
        account_count = rng.randint(2, 3)
        user_count = rng.randint(account_count * 6, account_count * 11)
        base_lambda_per_user = rng.uniform(0.006, 0.020)
        peak_multiplier = rng.uniform(1.8, 3.0)
        weekend_multiplier = rng.uniform(0.55, 1.05)
        burst_duration = rng.randint(2 * 60, 10 * 60)
        burst_multiplier = rng.uniform(1.6, 3.2)
        evening_spike_multiplier = rng.uniform(1.08, 1.45)
        request_cost_min = 1
        request_cost_max = 4
    else:
        account_count = rng.randint(2, 8)
        user_count = rng.randint(account_count + 1, 19)
        base_lambda_per_user = rng.uniform(0.010, 0.030)
        peak_multiplier = rng.uniform(1.3, 2.4)
        weekend_multiplier = rng.uniform(0.60, 1.00)
        burst_duration = rng.randint(2 * 60, 14 * 60)
        burst_multiplier = rng.uniform(1.7, 3.8)
        evening_spike_multiplier = rng.uniform(1.0, 1.20)
        request_cost_min = 1
        request_cost_max = 3

    burst_start_max = max(0, SEVEN_DAYS_MINUTES - burst_duration - 1)
    return ScenarioConfig(
        account_count=account_count,
        user_count=user_count,
        scenario_mode=scenario_mode,
        reset_pattern=choose_reset_pattern(rng, reset_mode),
        base_lambda_per_user=base_lambda_per_user,
        peak_multiplier=peak_multiplier,
        weekend_multiplier=weekend_multiplier,
        burst_start_minute=rng.randint(0, burst_start_max),
        burst_duration_minutes=burst_duration,
        burst_multiplier=burst_multiplier,
        evening_spike_multiplier=evening_spike_multiplier,
        request_cost_min=request_cost_min,
        request_cost_max=request_cost_max,
    )


def create_accounts_for_trial(rng: random.Random, scenario: ScenarioConfig) -> List[AccountState]:
    accounts: List[AccountState] = []
    count = scenario.account_count

    shared_seven_day_offset = rng.randint(0, SEVEN_DAYS_MINUTES - 1)
    stagger_step = max(1, SEVEN_DAYS_MINUTES // max(1, count))
    staggered_base = rng.randint(0, SEVEN_DAYS_MINUTES - 1)

    for index in range(count):
        if scenario.scenario_mode == "focused":
            five_hour_capacity = rng.randint(120, 260)
        else:
            five_hour_capacity = rng.randint(80, 180)
        if scenario.scenario_mode == "focused":
            if index == 0:
                weekly_factor = rng.uniform(13.0, 17.5)
            elif index == count - 1:
                weekly_factor = rng.uniform(20.0, 30.0)
            else:
                weekly_factor = rng.uniform(16.0, 23.5)
        else:
            weekly_factor = rng.uniform(10.0, 16.0)
        seven_day_capacity = max(five_hour_capacity * 6, int(five_hour_capacity * weekly_factor))
        five_hour_offset = rng.randint(0, FIVE_HOURS_MINUTES - 1)

        if scenario.reset_pattern == "same_reset":
            seven_day_offset = shared_seven_day_offset
        else:
            jitter = rng.randint(-90, 90)
            seven_day_offset = (staggered_base + (index * stagger_step) + jitter) % SEVEN_DAYS_MINUTES

        accounts.append(
            AccountState(
                index=index,
                five_hour_capacity=five_hour_capacity,
                seven_day_capacity=seven_day_capacity,
                five_hour_used=0,
                seven_day_used=0,
                five_hour_next_reset=five_hour_offset + FIVE_HOURS_MINUTES,
                seven_day_next_reset=seven_day_offset + SEVEN_DAYS_MINUTES,
            )
        )
    return accounts


def clone_accounts(accounts: Sequence[AccountState]) -> List[AccountState]:
    return [
        AccountState(
            index=account.index,
            five_hour_capacity=account.five_hour_capacity,
            seven_day_capacity=account.seven_day_capacity,
            five_hour_used=account.five_hour_used,
            seven_day_used=account.seven_day_used,
            five_hour_next_reset=account.five_hour_next_reset,
            seven_day_next_reset=account.seven_day_next_reset,
        )
        for account in accounts
    ]


def choose_and_serve_request(
    ordered_account_indices: Sequence[int],
    accounts: List[AccountState],
    cost: int,
) -> tuple[bool, bool, bool]:
    first_choice_failed_five_hour = False
    attempted = False
    for attempt_number, account_index in enumerate(ordered_account_indices):
        account = accounts[account_index]
        if account.can_serve(cost):
            account.consume(cost)
            migrated = attempt_number > 0
            return True, migrated, first_choice_failed_five_hour

        attempted = True
        if account.remaining_five_hour() < cost and attempt_number == 0:
            first_choice_failed_five_hour = True

    if not attempted:
        return False, False, False
    return False, False, first_choice_failed_five_hour


def evaluate_trial(
    trial_id: int,
    policy_name: str,
    policy_fn: Callable[[Sequence[AccountState], int], List[int]],
    scenario: ScenarioConfig,
    base_accounts: Sequence[AccountState],
    rng: random.Random,
) -> TrialMetrics:
    accounts = clone_accounts(base_accounts)
    total_demand = 0
    served_demand = 0
    peak_total_demand = 0
    peak_served_demand = 0
    migrated_requests = 0
    migration_successes = 0
    peak_useful_five_hour_sum = 0.0
    peak_minute_samples = 0

    for minute in range(SEVEN_DAYS_MINUTES):
        for account in accounts:
            account.reset_if_needed(minute)

        if is_peak_minute(minute):
            useful_accounts = 0
            useful_cost = max(2, scenario.request_cost_max - 1)
            for account in accounts:
                if account.remaining_five_hour() >= useful_cost and account.remaining_seven_day() >= useful_cost:
                    useful_accounts += 1
            peak_useful_five_hour_sum += useful_accounts / max(1, len(accounts))
            peak_minute_samples += 1

        intensity = minute_intensity_multiplier(scenario, minute)
        lam = scenario.user_count * scenario.base_lambda_per_user * intensity
        arrivals = poisson_sample(rng, lam)

        for _ in range(arrivals):
            cost = rng.randint(scenario.request_cost_min, scenario.request_cost_max)
            total_demand += cost
            peak = is_peak_minute(minute)
            if peak:
                peak_total_demand += cost

            order = policy_fn(accounts, minute)
            served, migrated, first_choice_failed_five_hour = choose_and_serve_request(
                order, accounts, cost
            )

            if first_choice_failed_five_hour:
                migrated_requests += 1
            if served:
                served_demand += cost
                if peak:
                    peak_served_demand += cost
                if migrated and first_choice_failed_five_hour:
                    migration_successes += 1

    denied_demand = max(0, total_demand - served_demand)
    seven_day_utilizations = [
        utilization_ratio(account.seven_day_used, account.seven_day_capacity) for account in accounts
    ]
    mean_weekly_utilization = sum(seven_day_utilizations) / max(1, len(seven_day_utilizations))
    weekly_drift = (
        math.sqrt(
            sum((util - mean_weekly_utilization) ** 2 for util in seven_day_utilizations)
            / max(1, len(seven_day_utilizations))
        )
        if seven_day_utilizations
        else 0.0
    )

    served_ratio = served_demand / total_demand if total_demand > 0 else 0.0
    peak_served_ratio = peak_served_demand / peak_total_demand if peak_total_demand > 0 else 0.0
    denial_rate = denied_demand / total_demand if total_demand > 0 else 1.0
    migration_recovery = (
        migration_successes / migrated_requests if migrated_requests > 0 else 1.0
    )
    peak_useful_five_hour = (
        peak_useful_five_hour_sum / peak_minute_samples if peak_minute_samples > 0 else 0.0
    )

    objective_score = (
        (0.42 * served_ratio)
        + (0.30 * peak_served_ratio)
        + (0.16 * peak_useful_five_hour)
        + (0.12 * migration_recovery)
        + (0.10 * mean_weekly_utilization)
        - (0.20 * denial_rate)
        - (0.10 * weekly_drift)
    )

    return TrialMetrics(
        policy=policy_name,
        trial_id=trial_id,
        scenario_mode=scenario.scenario_mode,
        reset_pattern=scenario.reset_pattern,
        account_count=scenario.account_count,
        user_count=scenario.user_count,
        total_demand=total_demand,
        served_demand=served_demand,
        denied_demand=denied_demand,
        peak_total_demand=peak_total_demand,
        peak_served_demand=peak_served_demand,
        migrated_requests=migrated_requests,
        migration_successes=migration_successes,
        peak_useful_five_hour=peak_useful_five_hour,
        weekly_drift=weekly_drift,
        mean_seven_day_utilization=mean_weekly_utilization,
        objective_score=objective_score,
    )


def aggregate_metrics(metrics: Sequence[TrialMetrics]) -> Dict[str, float]:
    if not metrics:
        return {}

    def mean(values: Sequence[float]) -> float:
        return sum(values) / max(1, len(values))

    served_ratios = [m.served_demand / m.total_demand for m in metrics if m.total_demand > 0]
    peak_served_ratios = [
        (m.peak_served_demand / m.peak_total_demand) if m.peak_total_demand > 0 else 0.0
        for m in metrics
    ]
    denial_rates = [m.denied_demand / m.total_demand for m in metrics if m.total_demand > 0]
    migration_recoveries = [
        (m.migration_successes / m.migrated_requests) if m.migrated_requests > 0 else 1.0
        for m in metrics
    ]
    peak_useful_five_hour_values = [m.peak_useful_five_hour for m in metrics]

    return {
        "trials": float(len(metrics)),
        "served_ratio_mean": mean(served_ratios),
        "peak_served_ratio_mean": mean(peak_served_ratios),
        "denial_rate_mean": mean(denial_rates),
        "migration_recovery_mean": mean(migration_recoveries),
        "peak_useful_five_hour_mean": mean(peak_useful_five_hour_values),
        "weekly_drift_mean": mean([m.weekly_drift for m in metrics]),
        "mean_seven_day_utilization_mean": mean([m.mean_seven_day_utilization for m in metrics]),
        "objective_score_mean": mean([m.objective_score for m in metrics]),
    }


def write_json(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)


def write_csv(path: Path, rows: Sequence[TrialMetrics]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].as_dict().keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row.as_dict())


def ranking_markdown(
    ranked_rows: Sequence[RankingRow],
    class_rankings: Dict[str, List[RankingRow]],
    winner_counts: Dict[str, Dict[str, int]],
    head_to_head: Dict[str, Dict[str, float]],
    challenger_policy: str,
    baseline_policy: str,
    seed: int,
    trials: int,
    scenario_mode: str,
    reset_mode: str,
    timestamp: str,
) -> str:
    lines = [
        "# Quota Policy Monte Carlo Report",
        "",
        f"- Timestamp (UTC): {timestamp}",
        f"- Trials: {trials}",
        f"- Seed: {seed}",
        f"- Scenario mode: {scenario_mode}",
        f"- Reset mode: {reset_mode}",
        "- Objective: maximize served + peak-served + peak 5h reserve + migration recovery + weekly utilization while minimizing denial and drift",
        "",
        "## Ranking",
        "",
        "| Rank | Policy | Objective | Served% | Peak Served% | Peak Useful 5h% | Denial% | Migration Recovery% | Weekly Drift | Weekly Utilization% |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in ranked_rows:
        lines.append(
            "| {rank} | {policy} | {objective:.4f} | {served:.2f} | {peak:.2f} | {peak_reserve:.2f} | {denial:.2f} | {migration:.2f} | {drift:.4f} | {weekly_util:.2f} |".format(
                rank=int(row["rank"]),
                policy=row["policy"],
                objective=float(row["objective_score_mean"]),
                served=float(row["served_ratio_mean"]) * 100.0,
                peak=float(row["peak_served_ratio_mean"]) * 100.0,
                peak_reserve=float(row["peak_useful_five_hour_mean"]) * 100.0,
                denial=float(row["denial_rate_mean"]) * 100.0,
                migration=float(row["migration_recovery_mean"]) * 100.0,
                drift=float(row["weekly_drift_mean"]),
                weekly_util=float(row["mean_seven_day_utilization_mean"]) * 100.0,
            )
        )

    lines.extend([
        "",
        f"Best policy: **{ranked_rows[0]['policy']}** (objective={float(ranked_rows[0]['objective_score_mean']):.4f})"
        if ranked_rows
        else "No ranking generated.",
        "",
        "## Ranking by Reset Class",
    ])

    for reset_class in ("same_reset", "staggered_reset"):
        rows = class_rankings.get(reset_class, [])
        lines.extend([
            "",
            f"### {reset_class}",
            "",
            "| Rank | Policy | Objective | Served% | Peak Served% | Denial% |",
            "|---:|---|---:|---:|---:|---:|",
        ])
        for row in rows:
            lines.append(
                "| {rank} | {policy} | {objective:.4f} | {served:.2f} | {peak:.2f} | {denial:.2f} |".format(
                    rank=int(row["rank"]),
                    policy=row["policy"],
                    objective=float(row["objective_score_mean"]),
                    served=float(row["served_ratio_mean"]) * 100.0,
                    peak=float(row["peak_served_ratio_mean"]) * 100.0,
                    denial=float(row["denial_rate_mean"]) * 100.0,
                )
            )
        if not rows:
            lines.append("| - | - | - | - | - | - |")

    lines.extend([
        "",
        f"## Head-to-Head: {challenger_policy} vs {baseline_policy}",
        "",
        "| Reset Class | Winner | Winner Trials | Avg Objective Delta (challenger - baseline) |",
        "|---|---|---:|---:|",
    ])
    for reset_class in ("same_reset", "staggered_reset"):
        class_winners = winner_counts.get(reset_class, {})
        class_duel = head_to_head.get(reset_class, {})
        challenger_wins = int(class_winners.get(challenger_policy, 0))
        baseline_wins = int(class_winners.get(baseline_policy, 0))
        ties = int(class_winners.get("tie", 0))
        winner_label = (
            challenger_policy
            if challenger_wins > baseline_wins
            else baseline_policy
            if baseline_wins > challenger_wins
            else "tie"
        )
        winner_trials = max(challenger_wins, baseline_wins, ties)
        lines.append(
            "| {reset_class} | {winner} | {winner_trials} | {delta:.4f} |".format(
                reset_class=reset_class,
                winner=winner_label,
                winner_trials=winner_trials,
                delta=float(class_duel.get("avg_objective_delta", 0.0)),
            )
        )

    staggered_delta = float(
        head_to_head.get("staggered_reset", {}).get("avg_objective_delta", 0.0)
    )
    if staggered_delta > 0.0:
        lines.extend([
            "",
            "Staggered-reset verdict: challenger beats baseline on objective.",
        ])
    elif staggered_delta < 0.0:
        lines.extend([
            "",
            "Staggered-reset verdict: challenger does not beat baseline on objective.",
        ])
    else:
        lines.extend([
            "",
            "Staggered-reset verdict: challenger ties baseline on objective.",
        ])

    return "\n".join(lines) + "\n"


def rank_summary(summary: Dict[str, Dict[str, float]]) -> List[RankingRow]:
    ranked_unsorted: List[RankingRow] = [
        RankingRow(
            policy=policy_name,
            trials=policy_summary["trials"],
            served_ratio_mean=policy_summary["served_ratio_mean"],
            peak_served_ratio_mean=policy_summary["peak_served_ratio_mean"],
            denial_rate_mean=policy_summary["denial_rate_mean"],
            migration_recovery_mean=policy_summary["migration_recovery_mean"],
            peak_useful_five_hour_mean=policy_summary["peak_useful_five_hour_mean"],
            weekly_drift_mean=policy_summary["weekly_drift_mean"],
            mean_seven_day_utilization_mean=policy_summary["mean_seven_day_utilization_mean"],
            objective_score_mean=policy_summary["objective_score_mean"],
            rank=0.0,
        )
        for policy_name, policy_summary in summary.items()
        if policy_summary
    ]
    ranked = sorted(
        ranked_unsorted,
        key=lambda item: float(item.get("objective_score_mean", -1.0)),
        reverse=True,
    )
    for index, row in enumerate(ranked, start=1):
        row["rank"] = float(index)
    return ranked


def run_simulation(
    trials: int,
    seed: int,
    output_dir: Path,
    scenario_mode: Literal["broad", "focused"],
    reset_mode: Literal["mixed", "same", "staggered"],
) -> RunArtifacts:
    master_rng = random.Random(seed)
    per_policy_metrics: Dict[str, List[TrialMetrics]] = {name: [] for name in POLICIES}
    all_rows: List[TrialMetrics] = []

    for trial_id in range(trials):
        scenario_seed = master_rng.randint(0, MAX_RANDOM_SEED)
        scenario_rng = random.Random(scenario_seed)
        scenario = create_scenario_config(
            rng=scenario_rng,
            scenario_mode=scenario_mode,
            reset_mode=reset_mode,
        )
        base_accounts = create_accounts_for_trial(scenario_rng, scenario)

        policy_seeds = {
            policy_name: scenario_rng.randint(0, MAX_RANDOM_SEED) for policy_name in POLICIES
        }
        for policy_name, policy_fn in POLICIES.items():
            trial_rng = random.Random(policy_seeds[policy_name])
            metrics = evaluate_trial(
                trial_id=trial_id,
                policy_name=policy_name,
                policy_fn=policy_fn,
                scenario=scenario,
                base_accounts=base_accounts,
                rng=trial_rng,
            )
            per_policy_metrics[policy_name].append(metrics)
            all_rows.append(metrics)

    summary: Dict[str, Dict[str, float]] = {
        policy_name: aggregate_metrics(metrics) for policy_name, metrics in per_policy_metrics.items()
    }
    ranked = rank_summary(summary)

    class_metrics: Dict[str, Dict[str, List[TrialMetrics]]] = {
        "same_reset": {policy_name: [] for policy_name in POLICIES},
        "staggered_reset": {policy_name: [] for policy_name in POLICIES},
    }
    for metric in all_rows:
        if metric.reset_pattern in class_metrics:
            class_metrics[metric.reset_pattern][metric.policy].append(metric)

    class_rankings: Dict[str, List[RankingRow]] = {}
    for reset_class, per_policy in class_metrics.items():
        class_summary = {
            policy_name: aggregate_metrics(policy_metrics)
            for policy_name, policy_metrics in per_policy.items()
        }
        class_rankings[reset_class] = rank_summary(class_summary)

    per_trial_policy_metrics: Dict[int, Dict[str, TrialMetrics]] = {}
    trial_classes: Dict[int, str] = {}
    for metric in all_rows:
        if metric.trial_id not in per_trial_policy_metrics:
            per_trial_policy_metrics[metric.trial_id] = {}
        per_trial_policy_metrics[metric.trial_id][metric.policy] = metric
        trial_classes[metric.trial_id] = metric.reset_pattern

    challenger_policy = "reset_near_expiry_reserve"
    baseline_policy = "seven_day_first"
    winner_counts: Dict[str, Dict[str, int]] = {
        "same_reset": {challenger_policy: 0, baseline_policy: 0, "tie": 0},
        "staggered_reset": {challenger_policy: 0, baseline_policy: 0, "tie": 0},
    }
    head_to_head: Dict[str, Dict[str, float]] = {
        "same_reset": {"avg_objective_delta": 0.0, "samples": 0.0},
        "staggered_reset": {"avg_objective_delta": 0.0, "samples": 0.0},
    }
    for trial_id, per_policy in per_trial_policy_metrics.items():
        reset_class = trial_classes.get(trial_id)
        if reset_class not in winner_counts:
            continue
        challenger_metrics = per_policy.get(challenger_policy)
        baseline_metrics = per_policy.get(baseline_policy)
        if challenger_metrics is None or baseline_metrics is None:
            continue

        delta = challenger_metrics.objective_score - baseline_metrics.objective_score
        head_to_head[reset_class]["avg_objective_delta"] += delta
        head_to_head[reset_class]["samples"] += 1.0

        if delta > 1e-9:
            winner_counts[reset_class][challenger_policy] += 1
        elif delta < -1e-9:
            winner_counts[reset_class][baseline_policy] += 1
        else:
            winner_counts[reset_class]["tie"] += 1

    for reset_class in head_to_head:
        samples = head_to_head[reset_class].get("samples", 0.0)
        total_delta = head_to_head[reset_class].get("avg_objective_delta", 0.0)
        head_to_head[reset_class]["avg_objective_delta"] = (
            total_delta / samples if samples > 0 else 0.0
        )

    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    payload: Dict[str, object] = {
        "timestamp_utc": timestamp,
        "seed": seed,
        "trials": trials,
        "scenario_mode": scenario_mode,
        "reset_mode": reset_mode,
        "policies": list(POLICIES.keys()),
        "summary": ranked,
        "summary_by_reset_class": class_rankings,
        "winner_counts_by_reset_class": winner_counts,
        "head_to_head": {
            "challenger_policy": challenger_policy,
            "baseline_policy": baseline_policy,
            "by_reset_class": head_to_head,
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"summary-{timestamp}.json"
    latest_json = output_dir / "latest_summary.json"
    csv_path = output_dir / f"trial-metrics-{timestamp}.csv"
    latest_csv = output_dir / "latest_trial_metrics.csv"
    md_path = output_dir / f"report-{timestamp}.md"
    latest_md = output_dir / "latest_report.md"

    write_json(json_path, payload)
    write_json(latest_json, payload)
    write_csv(csv_path, all_rows)
    write_csv(latest_csv, all_rows)

    report_md = ranking_markdown(
        ranked_rows=ranked,
        class_rankings=class_rankings,
        winner_counts=winner_counts,
        head_to_head=head_to_head,
        challenger_policy=challenger_policy,
        baseline_policy=baseline_policy,
        seed=seed,
        trials=trials,
        scenario_mode=scenario_mode,
        reset_mode=reset_mode,
        timestamp=timestamp,
    )
    md_path.write_text(report_md, encoding="utf-8")
    latest_md.write_text(report_md, encoding="utf-8")

    return RunArtifacts(
        timestamp=timestamp,
        summary=ranked,
        json_path=str(json_path),
        latest_json=str(latest_json),
        csv_path=str(csv_path),
        latest_csv=str(latest_csv),
        report_path=str(md_path),
        latest_report=str(latest_md),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Monte Carlo comparison of multi-account Anthropic quota-selection policies."
        )
    )
    parser.add_argument("--trials", type=int, default=1000, help="number of randomized trials")
    parser.add_argument("--seed", type=int, default=20260211, help="master random seed")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("simulations/results"),
        help="directory for generated report artifacts",
    )
    parser.add_argument(
        "--scenario-mode",
        choices=("broad", "focused"),
        default="focused",
        help="scenario generator mode: broad random mix or focused low-account high-user stress",
    )
    parser.add_argument(
        "--reset-mode",
        choices=("mixed", "same", "staggered"),
        default="mixed",
        help="weekly reset pattern generation mode",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    trials = int(args.trials)  # pyright: ignore[reportAny]
    seed = int(args.seed)  # pyright: ignore[reportAny]
    output_dir = Path(args.output_dir)  # pyright: ignore[reportAny]
    scenario_mode = str(args.scenario_mode)  # pyright: ignore[reportAny]
    reset_mode = str(args.reset_mode)  # pyright: ignore[reportAny]
    if trials < 1:
        raise SystemExit("--trials must be >= 1")
    if scenario_mode not in ("broad", "focused"):
        raise SystemExit("--scenario-mode must be one of: broad, focused")
    if reset_mode not in ("mixed", "same", "staggered"):
        raise SystemExit("--reset-mode must be one of: mixed, same, staggered")

    result = run_simulation(
        trials=trials,
        seed=seed,
        output_dir=output_dir,
        scenario_mode=scenario_mode,
        reset_mode=reset_mode,
    )
    ranked = result.summary
    if not ranked:
        raise SystemExit("No ranking generated.")

    best = ranked[0]
    print("Simulation complete.")
    print(f"Trials: {trials}")
    print(f"Seed: {seed}")
    print(f"Scenario mode: {scenario_mode}")
    print(f"Reset mode: {reset_mode}")
    print(f"Best policy: {best['policy']} (objective={float(best['objective_score_mean']):.4f})")
    print(f"Summary JSON: {result.latest_json}")
    print(f"Trial CSV: {result.latest_csv}")
    print(f"Report: {result.latest_report}")


if __name__ == "__main__":
    main()
