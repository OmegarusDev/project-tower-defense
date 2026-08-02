class_name AttackPlan
extends RefCounted
## Single resolver: (base, barrel) → pattern; payload fills damage/status. No scattered AoE ifs.

enum Pattern { PROJECTILE, PULSE, HYBRID }

var pattern: int = Pattern.PROJECTILE
var projectile_count: int = 1
var spread_deg: float = 0.0
var alternating: bool = false
var pierce: int = 0
var pulse_radius: float = 0.0
var range_cells: float = 3.0
var fire_interval: float = 1.0
var projectile_speed: float = 8.0
var air_capable: bool = false
var damage: float = 10.0
var damage_type: String = "kinetic"
var aoe_radius: float = 0.0
var aoe_falloff: bool = true
var status: Dictionary = {}
var chain_jumps: int = 0
var chain_falloff: float = 0.7
var homing: bool = true
var aura_damage_mult: float = 1.0
var aura_rof_mult: float = 1.0
var aura_radius: float = 0.0
var provides_aura: bool = false

## Channel stack modes applied while building.
static func stack_max(a: float, b: float) -> float:
	return maxf(a, b)


static func from_loadout(base_id: String, barrel_id: String, payload_id: String, level: int, parts: Dictionary) -> AttackPlan:
	var plan := AttackPlan.new()
	var base: Dictionary = parts.get("bases", {}).get(base_id, {})
	var barrel: Dictionary = parts.get("barrels", {}).get(barrel_id, {})
	var payload: Dictionary = parts.get("payloads", {}).get(payload_id, {})

	# --- Base verbs ---
	plan.range_cells = float(base.get("range", 3.0))
	plan.fire_interval = float(base.get("fire_interval", 1.0))
	plan.provides_aura = bool(base.get("aura", false))
	plan.aura_radius = float(base.get("aura_radius", 0.0))
	plan.aura_damage_mult = float(base.get("aura_damage_mult", 1.0))
	plan.aura_rof_mult = float(base.get("aura_rof_mult", 1.0))
	var base_pulse := bool(base.get("pulse_primary", false))

	# --- Barrel pattern ---
	var barrel_pattern: String = str(barrel.get("pattern", "projectile"))
	plan.projectile_count = int(barrel.get("count", 1))
	plan.spread_deg = float(barrel.get("spread_deg", 0.0))
	plan.alternating = bool(barrel.get("alternating", false))
	plan.pierce = int(barrel.get("pierce", 0))
	plan.pulse_radius = float(barrel.get("pulse_radius", 0.0))
	plan.range_cells *= float(barrel.get("range_mult", 1.0))
	plan.fire_interval /= maxf(0.05, float(barrel.get("rof_mult", 1.0)))
	plan.air_capable = bool(barrel.get("air_capable", false))
	plan.projectile_speed = float(barrel.get("speed", 8.0))
	plan.homing = bool(barrel.get("homing", true))

	if base_pulse or barrel_pattern == "pulse":
		plan.pattern = Pattern.PULSE
		plan.pulse_radius = stack_max(plan.pulse_radius, float(base.get("pulse_radius", 1.5)))
		if barrel_pattern == "pulse":
			plan.pulse_radius = stack_max(plan.pulse_radius, float(barrel.get("pulse_radius", 1.5)))
	elif barrel_pattern == "hybrid":
		plan.pattern = Pattern.HYBRID
	else:
		plan.pattern = Pattern.PROJECTILE

	# Commander: aura + gun
	if plan.provides_aura and not base_pulse:
		if plan.pattern == Pattern.PULSE:
			plan.pattern = Pattern.HYBRID
		# else keep projectile; aura is parallel

	# --- Payload ---
	plan.damage = float(payload.get("damage", 10.0))
	plan.damage_type = str(payload.get("damage_type", "kinetic"))
	plan.aoe_radius = float(payload.get("aoe_radius", 0.0))
	plan.aoe_falloff = bool(payload.get("aoe_falloff", true))
	plan.chain_jumps = int(payload.get("chain_jumps", 0))
	plan.chain_falloff = float(payload.get("chain_falloff", 0.7))
	plan.status = payload.get("status", {}).duplicate(true)
	if payload.has("speed"):
		plan.projectile_speed = float(payload["speed"])

	# Level curve (general by base type)
	var lvl_mult := 1.0 + 0.12 * float(maxi(0, level - 1))
	match str(base.get("level_bias", "balanced")):
		"range":
			plan.range_cells *= 1.0 + 0.08 * float(level - 1)
			plan.damage *= lvl_mult
		"rof":
			plan.fire_interval /= 1.0 + 0.08 * float(level - 1)
			plan.damage *= lvl_mult * 0.9
		"pulse":
			plan.pulse_radius *= 1.0 + 0.06 * float(level - 1)
			plan.damage *= lvl_mult
		"aura":
			plan.aura_damage_mult *= 1.0 + 0.05 * float(level - 1)
			plan.aura_rof_mult *= 1.0 + 0.05 * float(level - 1)
			plan.damage *= lvl_mult * 0.85
		_:
			plan.damage *= lvl_mult
			plan.range_cells *= 1.0 + 0.03 * float(level - 1)

	return plan


func to_dict() -> Dictionary:
	return {
		"pattern": pattern,
		"projectile_count": projectile_count,
		"spread_deg": spread_deg,
		"alternating": alternating,
		"pierce": pierce,
		"pulse_radius": pulse_radius,
		"range_cells": range_cells,
		"fire_interval": fire_interval,
		"projectile_speed": projectile_speed,
		"air_capable": air_capable,
		"damage": damage,
		"damage_type": damage_type,
		"aoe_radius": aoe_radius,
		"aoe_falloff": aoe_falloff,
		"status": status,
		"chain_jumps": chain_jumps,
		"chain_falloff": chain_falloff,
		"homing": homing,
		"aura_damage_mult": aura_damage_mult,
		"aura_rof_mult": aura_rof_mult,
		"aura_radius": aura_radius,
		"provides_aura": provides_aura,
	}
