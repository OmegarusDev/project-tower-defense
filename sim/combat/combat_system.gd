class_name CombatSystem
extends RefCounted
## Targeting buckets, AttackPlan fire, projectiles, pulses, status, aura influence map.

var world: SimWorld
var parts: Dictionary = {}
var _aura_damage: PackedFloat32Array = PackedFloat32Array()
var _aura_rof: PackedFloat32Array = PackedFloat32Array()
var _auras_dirty: bool = true
var _alt_toggle: Dictionary = {} # tower_id -> bool
var _bucket_cols: int = 0
var _bucket_rows: int = 0
var _buckets: Array = [] # Array of Array[int] enemy indices


func setup(p_world: SimWorld) -> void:
	world = p_world
	parts = _load_parts()
	_auras_dirty = true


func dirty_auras() -> void:
	_auras_dirty = true


func _load_parts() -> Dictionary:
	var path := "res://data/parts.json"
	if FileAccess.file_exists(path):
		var f := FileAccess.open(path, FileAccess.READ)
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_DICTIONARY:
			return parsed
	return PartsFallback.data()


func tick_towers() -> void:
	if _auras_dirty:
		_rebuild_aura_map()
	_rebuild_buckets()
	for t in world.towers:
		_tick_one_tower(t)


func tick_projectiles() -> void:
	var i := 0
	while i < world.projectiles.size():
		var p: Dictionary = world.projectiles[i]
		var target := _find_enemy(int(p.get("target_id", -1)))
		if target.is_empty() and bool(p.get("homing", true)):
			world.projectiles.remove_at(i)
			continue
		var pos: Vector2 = p["pos"]
		var dest: Vector2
		if target.is_empty():
			dest = p.get("dest", pos)
		else:
			dest = target.get("pos", Vector2(target["cell"]) + Vector2(0.5, 0.5))
		var vel: float = float(p.get("speed", 8.0)) / float(SimWorld.TICK_HZ)
		var delta: Vector2 = dest - pos
		if delta.length() <= vel or delta.length_squared() < 0.0001:
			_on_projectile_hit(p, target)
			world.projectiles.remove_at(i)
			continue
		p["pos"] = pos + delta.normalized() * vel
		i += 1


func tick_status() -> void:
	for e in world.enemies:
		var burn_t: float = float(e.get("burn_t", 0.0))
		if burn_t > 0.0:
			e["burn_t"] = burn_t - SimWorld.TICK_DT
			var tick_every: float = float(e.get("burn_every", 0.5))
			var acc: float = float(e.get("burn_acc", 0.0)) + SimWorld.TICK_DT
			if acc >= tick_every:
				e["burn_acc"] = acc - tick_every
				e["hp"] = float(e["hp"]) - float(e.get("burn_dps", 1.0))
			else:
				e["burn_acc"] = acc
		var slow_t: float = float(e.get("slow_t", 0.0))
		if slow_t > 0.0:
			e["slow_t"] = slow_t - SimWorld.TICK_DT
			if float(e["slow_t"]) <= 0.0:
				e["slow_amount"] = 0.0


func _tick_one_tower(t: Dictionary) -> void:
	var plan := AttackPlan.from_loadout(
		str(t["base"]), str(t["barrel"]), str(t["payload"]), int(t["level"]), parts
	)
	var cell: Vector2i = t["cell"]
	var aura_i: int = world.grid.idx(cell)
	var rof_mult: float = _aura_rof[aura_i] if aura_i < _aura_rof.size() else 1.0
	var dmg_mult: float = _aura_damage[aura_i] if aura_i < _aura_damage.size() else 1.0
	plan.fire_interval /= maxf(0.05, rof_mult)
	plan.damage *= dmg_mult

	var cd: float = float(t.get("cooldown", 0.0))
	if cd > 0.0:
		t["cooldown"] = cd - SimWorld.TICK_DT
		return

	var target := _select_target(t, plan)
	if target.is_empty():
		return

	t["cooldown"] = plan.fire_interval
	t["target_id"] = int(target["id"])

	match plan.pattern:
		AttackPlan.Pattern.PULSE:
			_fire_pulse(t, plan, cell)
		AttackPlan.Pattern.HYBRID:
			_fire_pulse(t, plan, cell)
			_fire_projectiles(t, plan, target)
		_:
			_fire_projectiles(t, plan, target)

	world.emit_event("tower_fired", {"tower_id": t["id"], "pattern": plan.pattern})


func _fire_pulse(t: Dictionary, plan: AttackPlan, origin: Vector2i) -> void:
	var r2 := plan.pulse_radius * plan.pulse_radius
	for e in world.enemies:
		if bool(e.get("flying", false)) and not plan.air_capable:
			continue
		var epos: Vector2 = e.get("pos", Vector2(e["cell"]) + Vector2(0.5, 0.5))
		var o := Vector2(origin) + Vector2(0.5, 0.5)
		var dist := epos.distance_to(o)
		if dist > plan.pulse_radius:
			continue
		var dmg := plan.damage
		if plan.aoe_falloff and plan.pulse_radius > 0.0:
			dmg *= 1.0 - 0.5 * (dist / plan.pulse_radius)
		_apply_hit(e, dmg, plan, t)


func _fire_projectiles(t: Dictionary, plan: AttackPlan, target: Dictionary) -> void:
	var count := plan.projectile_count
	if plan.alternating:
		var tid := int(t["id"])
		var side: bool = bool(_alt_toggle.get(tid, false))
		_alt_toggle[tid] = not side
		count = 1
	var origin := Vector2(t["cell"]) + Vector2(0.5, 0.5)
	for n in count:
		var angle_off := 0.0
		if count > 1 and plan.spread_deg > 0.0:
			var tnorm := (float(n) / float(count - 1)) - 0.5
			angle_off = deg_to_rad(plan.spread_deg) * tnorm
		var proj := {
			"id": world.alloc_id(),
			"pos": origin,
			"target_id": int(target["id"]),
			"speed": plan.projectile_speed,
			"damage": plan.damage,
			"damage_type": plan.damage_type,
			"pierce": plan.pierce,
			"homing": plan.homing,
			"aoe_radius": plan.aoe_radius,
			"aoe_falloff": plan.aoe_falloff,
			"status": plan.status.duplicate(true),
			"chain_jumps": plan.chain_jumps,
			"chain_falloff": plan.chain_falloff,
			"air_capable": plan.air_capable,
			"tower_id": int(t["id"]),
			"angle_off": angle_off,
		}
		world.projectiles.append(proj)


func _on_projectile_hit(p: Dictionary, target: Dictionary) -> void:
	if target.is_empty():
		return
	if bool(target.get("flying", false)) and not bool(p.get("air_capable", false)):
		return
	var plan_like := {
		"damage_type": p.get("damage_type", "kinetic"),
		"status": p.get("status", {}),
		"aoe_radius": p.get("aoe_radius", 0.0),
		"aoe_falloff": p.get("aoe_falloff", true),
		"chain_jumps": p.get("chain_jumps", 0),
		"chain_falloff": p.get("chain_falloff", 0.7),
		"air_capable": p.get("air_capable", false),
	}
	var fake_plan := AttackPlan.new()
	fake_plan.damage_type = str(plan_like["damage_type"])
	fake_plan.status = plan_like["status"]
	fake_plan.aoe_radius = float(plan_like["aoe_radius"])
	fake_plan.aoe_falloff = bool(plan_like["aoe_falloff"])
	fake_plan.chain_jumps = int(plan_like["chain_jumps"])
	fake_plan.chain_falloff = float(plan_like["chain_falloff"])
	fake_plan.air_capable = bool(plan_like["air_capable"])

	var tower := _find_tower(int(p.get("tower_id", -1)))
	_apply_hit(target, float(p["damage"]), fake_plan, tower)

	if fake_plan.aoe_radius > 0.0:
		var center: Vector2 = target.get("pos", Vector2(target["cell"]) + Vector2(0.5, 0.5))
		for e in world.enemies:
			if int(e["id"]) == int(target["id"]):
				continue
			if bool(e.get("flying", false)) and not fake_plan.air_capable:
				continue
			var d := center.distance_to(e.get("pos", Vector2(e["cell"]) + Vector2(0.5, 0.5)))
			if d <= fake_plan.aoe_radius:
				var dmg := float(p["damage"])
				if fake_plan.aoe_falloff:
					dmg *= 1.0 - 0.5 * (d / fake_plan.aoe_radius)
				_apply_hit(e, dmg, fake_plan, tower)

	var jumps := fake_plan.chain_jumps
	var dmg_chain := float(p["damage"])
	var from_pos: Vector2 = target.get("pos", Vector2(target["cell"]) + Vector2(0.5, 0.5))
	var hit_ids: Dictionary = {int(target["id"]): true}
	while jumps > 0:
		jumps -= 1
		dmg_chain *= fake_plan.chain_falloff
		var next_e := _nearest_enemy(from_pos, hit_ids, fake_plan.air_capable)
		if next_e.is_empty():
			break
		hit_ids[int(next_e["id"])] = true
		_apply_hit(next_e, dmg_chain, fake_plan, tower)
		from_pos = next_e.get("pos", Vector2(next_e["cell"]) + Vector2(0.5, 0.5))


func _apply_hit(e: Dictionary, damage: float, plan: AttackPlan, tower: Dictionary) -> void:
	var hp := float(e.get("hp", 1.0))
	var armor := float(e.get("armor_flat", 0.0))
	var resist := float(e.get("resist", {}).get(plan.damage_type, 0.0))
	var immune: Array = e.get("immune", [])
	if plan.damage_type in immune:
		world.emit_event("hit_immune", {"enemy_id": e["id"], "type": plan.damage_type})
		return
	var dmg := maxf(0.0, damage - armor) * (1.0 - clampf(resist, 0.0, 0.95))
	e["hp"] = hp - dmg
	_apply_status(e, plan.status)
	if not tower.is_empty():
		_grant_xp(tower, 1.0)
	world.emit_event("hit", {"enemy_id": e["id"], "damage": dmg, "type": plan.damage_type})


func _apply_status(e: Dictionary, status: Dictionary) -> void:
	if status.is_empty():
		return
	if status.has("burn"):
		var b: Dictionary = status["burn"]
		e["burn_t"] = maxf(float(e.get("burn_t", 0.0)), float(b.get("duration", 3.0)))
		e["burn_dps"] = maxf(float(e.get("burn_dps", 0.0)), float(b.get("dps", 1.0)))
		e["burn_every"] = float(b.get("every", 0.5))
	if status.has("slow"):
		var s: Dictionary = status["slow"]
		e["slow_t"] = maxf(float(e.get("slow_t", 0.0)), float(s.get("duration", 2.0)))
		e["slow_amount"] = maxf(float(e.get("slow_amount", 0.0)), float(s.get("amount", 0.5)))
		if float(e["slow_amount"]) >= 1.0:
			e["slow_amount"] = 1.0 # freeze


func _grant_xp(tower: Dictionary, amount: float) -> void:
	tower["xp"] = float(tower.get("xp", 0.0)) + amount
	var need: float = float(tower.get("xp_to_point", 100.0))
	while float(tower["xp"]) >= need:
		tower["xp"] = float(tower["xp"]) - need
		tower["level_points"] = int(tower.get("level_points", 0)) + 1
		world.emit_event("level_point_gained", {"tower_id": tower["id"]})


func _select_target(t: Dictionary, plan: AttackPlan) -> Dictionary:
	var origin := Vector2(t["cell"]) + Vector2(0.5, 0.5)
	var range_c := plan.range_cells
	var mode: String = str(t.get("targeting", "first"))
	var best: Dictionary = {}
	var best_score := -1_000_000.0
	for e in world.enemies:
		if bool(e.get("flying", false)) and not plan.air_capable:
			continue
		var epos: Vector2 = e.get("pos", Vector2(e["cell"]) + Vector2(0.5, 0.5))
		if origin.distance_to(epos) > range_c:
			continue
		var score := 0.0
		match mode:
			"last":
				score = -float(world.grid.ground_distance(e["cell"]))
			"strongest":
				score = float(e.get("hp", 0.0))
			"weakest":
				score = -float(e.get("hp", 0.0))
			"closest":
				score = -origin.distance_to(epos)
			_:
				# first = closest to exit
				score = -float(world.grid.ground_distance(e["cell"]))
				if bool(e.get("flying", false)):
					score = -float(world.grid.air_dist[world.grid.idx(e["cell"])])
		if score > best_score or best.is_empty():
			best_score = score
			best = e
	return best


func _rebuild_aura_map() -> void:
	var n: int = world.grid.cols * world.grid.rows
	_aura_damage.resize(n)
	_aura_rof.resize(n)
	_aura_damage.fill(1.0)
	_aura_rof.fill(1.0)
	for t in world.towers:
		var plan: AttackPlan = AttackPlan.from_loadout(
			str(t["base"]), str(t["barrel"]), str(t["payload"]), int(t["level"]), parts
		)
		if not plan.provides_aura:
			continue
		var origin: Vector2i = t["cell"]
		var r: int = int(ceil(plan.aura_radius))
		for dy in range(-r, r + 1):
			for dx in range(-r, r + 1):
				var c: Vector2i = origin + Vector2i(dx, dy)
				if not world.grid.in_bounds(c):
					continue
				if Vector2(dx, dy).length() > plan.aura_radius:
					continue
				var i: int = world.grid.idx(c)
				_aura_damage[i] = maxf(_aura_damage[i], plan.aura_damage_mult)
				_aura_rof[i] = maxf(_aura_rof[i], plan.aura_rof_mult)
	_auras_dirty = false


func _rebuild_buckets() -> void:
	_bucket_cols = world.grid.cols
	_bucket_rows = world.grid.rows
	var n := _bucket_cols * _bucket_rows
	_buckets.resize(n)
	for i in n:
		_buckets[i] = []
	for ei in world.enemies.size():
		var e: Dictionary = world.enemies[ei]
		var cell: Vector2i = e["cell"]
		if world.grid.in_bounds(cell):
			_buckets[world.grid.idx(cell)].append(ei)


func _find_enemy(id: int) -> Dictionary:
	for e in world.enemies:
		if int(e["id"]) == id:
			return e
	return {}


func _find_tower(id: int) -> Dictionary:
	for t in world.towers:
		if int(t["id"]) == id:
			return t
	return {}


func _nearest_enemy(from_pos: Vector2, exclude: Dictionary, air_ok: bool) -> Dictionary:
	var best: Dictionary = {}
	var best_d := 1_000_000.0
	for e in world.enemies:
		if exclude.has(int(e["id"])):
			continue
		if bool(e.get("flying", false)) and not air_ok:
			continue
		var d := from_pos.distance_to(e.get("pos", Vector2(e["cell"]) + Vector2(0.5, 0.5)))
		if d < best_d:
			best_d = d
			best = e
	return best
