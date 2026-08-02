#!/usr/bin/env python3
"""Lightweight AttackPlan resolution rules (mirrors attack_plan.gd)."""


def resolve(base, barrel):
    base_pulse = base.get("pulse_primary", False)
    barrel_pattern = barrel.get("pattern", "projectile")
    provides_aura = base.get("aura", False)
    pulse_r = 0.0
    if base_pulse or barrel_pattern == "pulse":
        pattern = "pulse"
        pulse_r = max(base.get("pulse_radius", 0.0), barrel.get("pulse_radius", 0.0))
    else:
        pattern = "projectile"
    if provides_aura and not base_pulse and pattern == "pulse":
        pattern = "hybrid"
    return pattern, pulse_r, provides_aura


def test_trap_radius_pulse():
    pattern, r, aura = resolve(
        {"pulse_primary": True, "pulse_radius": 1.6},
        {"pattern": "pulse", "pulse_radius": 2.0},
    )
    assert pattern == "pulse"
    assert r == 2.0
    assert not aura


def test_commander_gun():
    pattern, r, aura = resolve(
        {"aura": True, "aura_radius": 2.5},
        {"pattern": "projectile"},
    )
    assert pattern == "projectile"
    assert aura


def test_watchtower_single():
    pattern, r, aura = resolve({}, {"pattern": "projectile"})
    assert pattern == "projectile"
    assert not aura


if __name__ == "__main__":
    test_trap_radius_pulse()
    test_commander_gun()
    test_watchtower_single()
    print("ALL PYTHON ATTACK-PLAN TESTS PASSED")
