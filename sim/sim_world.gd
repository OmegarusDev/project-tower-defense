class_name SimWorld
extends RefCounted
## Pure fixed-timestep simulation. No drawing, no audio, no Godot nodes required.

signal event_emitted(event: Dictionary)

const TICK_HZ := 60
const TICK_DT := 1.0 / TICK_HZ

var grid: BoardGrid
var combat: CombatSystem
var economy: EconomyState
var wave_manager: WaveManager
var roster_snapshot: Array[Dictionary] = []

var towers: Array[Dictionary] = []
var walls: Array[Dictionary] = []
var enemies: Array[Dictionary] = []
var projectiles: Array[Dictionary] = []

var tick_index: int = 0
var lives: int = 3
var wave_index: int = 0
var speed_mult: float = 1.0
var seed_value: int = 1
var mode_endless: bool = true
var running: bool = false
var _next_id: int = 1


func setup(cols: int, rows: int, p_seed: int = 1, endless: bool = true) -> void:
	seed_value = p_seed
	mode_endless = endless
	grid = BoardGrid.new()
	grid.setup(cols, rows)
	combat = CombatSystem.new()
	combat.setup(self)
	economy = EconomyState.new()
	economy.setup_run_start()
	wave_manager = WaveManager.new()
	wave_manager.setup(self)
	towers.clear()
	walls.clear()
	enemies.clear()
	projectiles.clear()
	tick_index = 0
	lives = 3
	wave_index = 0
	running = false
	_next_id = 1
	grid.recompute_fields()


func alloc_id() -> int:
	var id := _next_id
	_next_id += 1
	return id


func emit_event(kind: String, payload: Dictionary = {}) -> void:
	var e := payload.duplicate()
	e["kind"] = kind
	e["tick"] = tick_index
	event_emitted.emit(e)


func tick() -> void:
	if not running:
		return
	tick_index += 1
	wave_manager.tick()
	combat.tick_towers()
	combat.tick_projectiles()
	_tick_enemies()
	combat.tick_status()


func set_roster(slots: Array[Dictionary]) -> void:
	roster_snapshot = slots.duplicate(true)


func try_place_wall(cell: Vector2i) -> Dictionary:
	if not grid.in_bounds(cell) or not grid.is_buildable(cell):
		return {"ok": false, "reason": "blocked"}
	var cost := economy.wall_cost(walls.size())
	if economy.battle < cost:
		return {"ok": false, "reason": "need_battle", "need": cost}
	grid.set_blocked(cell, true)
	if not grid.has_ground_path():
		grid.set_blocked(cell, false)
		grid.recompute_fields()
		return {"ok": false, "reason": "path_sealed"}
	economy.spend_battle(cost)
	var wall := {"id": alloc_id(), "cell": cell, "paid": cost}
	walls.append(wall)
	grid.recompute_fields()
	emit_event("wall_placed", {"wall": wall})
	return {"ok": true, "wall": wall}


func try_place_tower(cell: Vector2i, slot_index: int) -> Dictionary:
	if slot_index < 0 or slot_index >= roster_snapshot.size():
		return {"ok": false, "reason": "bad_slot"}
	var loadout: Dictionary = roster_snapshot[slot_index]
	if not loadout.get("complete", false):
		return {"ok": false, "reason": "incomplete_triad"}
	if not grid.in_bounds(cell) or not grid.is_buildable(cell):
		return {"ok": false, "reason": "blocked"}
	var cost: int = int(loadout.get("place_cost", 50))
	if economy.battle < cost:
		return {"ok": false, "reason": "need_battle", "need": cost}
	grid.set_blocked(cell, true)
	if not grid.has_ground_path():
		grid.set_blocked(cell, false)
		grid.recompute_fields()
		return {"ok": false, "reason": "path_sealed"}
	economy.spend_battle(cost)
	var tower := {
		"id": alloc_id(),
		"cell": cell,
		"slot": slot_index,
		"base": loadout.get("base", "watchtower"),
		"barrel": loadout.get("barrel", "single"),
		"payload": loadout.get("payload", "pellet"),
		"paid": cost,
		"level": 1,
		"xp": 0.0,
		"xp_to_point": 100.0,
		"level_points": 0,
		"level_cap": int(loadout.get("level_cap", 1)),
		"targeting": "first",
		"cooldown": 0.0,
		"target_id": -1,
	}
	towers.append(tower)
	grid.recompute_fields()
	combat.dirty_auras()
	emit_event("tower_placed", {"tower": tower})
	return {"ok": true, "tower": tower}


func try_sell_tower(tower_id: int) -> Dictionary:
	for i in towers.size():
		var t: Dictionary = towers[i]
		if int(t["id"]) != tower_id:
			continue
		var refund: int = int(t["paid"] * 0.5)
		economy.add_battle(refund)
		grid.set_blocked(t["cell"], false)
		towers.remove_at(i)
		grid.recompute_fields()
		combat.dirty_auras()
		emit_event("tower_sold", {"id": tower_id, "refund": refund})
		return {"ok": true, "refund": refund}
	return {"ok": false, "reason": "missing"}


func try_sell_wall(wall_id: int) -> Dictionary:
	for i in walls.size():
		var w: Dictionary = walls[i]
		if int(w["id"]) != wall_id:
			continue
		var refund: int = int(w["paid"] * 0.5)
		economy.add_battle(refund)
		grid.set_blocked(w["cell"], false)
		walls.remove_at(i)
		grid.recompute_fields()
		emit_event("wall_sold", {"id": wall_id, "refund": refund})
		return {"ok": true, "refund": refund}
	return {"ok": false, "reason": "missing"}


func spend_level_point(tower_id: int) -> Dictionary:
	for t in towers:
		if int(t["id"]) != tower_id:
			continue
		if int(t["level_points"]) <= 0:
			return {"ok": false, "reason": "no_level_up_point"}
		if int(t["level"]) >= int(t["level_cap"]):
			return {"ok": false, "reason": "at_cap"}
		t["level_points"] = int(t["level_points"]) - 1
		t["level"] = int(t["level"]) + 1
		combat.dirty_auras()
		emit_event("tower_leveled", {"tower": t})
		return {"ok": true, "tower": t}
	return {"ok": false, "reason": "missing"}


func grow_south(extra_rows: int) -> void:
	grid.grow_south(extra_rows)
	grid.recompute_fields()
	emit_event("grid_grew", {"rows": grid.rows, "cols": grid.cols})


func start_wave() -> void:
	running = true
	wave_manager.start_next_wave()
	emit_event("wave_started", {"wave": wave_index})


func checkpoint_blob() -> Dictionary:
	return {
		"tick": tick_index,
		"wave": wave_index,
		"lives": lives,
		"battle": economy.battle,
		"forge": economy.forge,
		"aether": economy.aether,
		"towers": towers.duplicate(true),
		"walls": walls.duplicate(true),
		"enemies": enemies.duplicate(true),
		"roster": roster_snapshot.duplicate(true),
		"seed": seed_value,
		"cols": grid.cols,
		"rows": grid.rows,
		"blocked": Array(grid.export_blocked()),
		"running": running,
		"wave_active": wave_manager.wave_active if wave_manager else false,
		"to_spawn": wave_manager.to_spawn if wave_manager else 0,
	}


func load_checkpoint(blob: Dictionary) -> void:
	setup(int(blob.get("cols", 11)), int(blob.get("rows", 14)), int(blob.get("seed", 1)), true)
	economy.battle = int(blob.get("battle", 100))
	economy.forge = int(blob.get("forge", 0))
	economy.aether = int(blob.get("aether", 0))
	lives = int(blob.get("lives", 3))
	wave_index = int(blob.get("wave", 0))
	tick_index = int(blob.get("tick", 0))
	set_roster(blob.get("roster", RosterBuilder.default_slots()))
	var blocked: Array = blob.get("blocked", [])
	if blocked.size() == grid.cols * grid.rows:
		for i in blocked.size():
			grid.blocked[i] = int(blocked[i])
	towers = blob.get("towers", [])
	walls = blob.get("walls", [])
	enemies = blob.get("enemies", [])
	# Rebuild occupancy from towers/walls
	for t in towers:
		grid.set_blocked(t["cell"], true)
	for w in walls:
		grid.set_blocked(w["cell"], true)
	grid.recompute_fields()
	combat.dirty_auras()
	running = false # resume at wave start — player Calls Early / auto after load
	wave_manager.wave_active = false
	wave_manager.to_spawn = 0
	emit_event("checkpoint_loaded", {"wave": wave_index})


func _tick_enemies() -> void:
	var i := 0
	while i < enemies.size():
		var e: Dictionary = enemies[i]
		if float(e.get("hp", 1.0)) <= 0.0:
			var drop: int = int(e.get("battle_drop", 1))
			economy.add_battle(drop)
			emit_event("enemy_killed", {"enemy": e, "drop": drop})
			enemies.remove_at(i)
			continue
		_advance_enemy(e)
		if bool(e.get("reached_exit", false)):
			lives -= int(e.get("leak_damage", 1))
			emit_event("leak", {"enemy": e, "lives": lives})
			enemies.remove_at(i)
			if lives <= 0:
				running = false
				emit_event("game_over", {})
			continue
		i += 1


func _advance_enemy(e: Dictionary) -> void:
	var speed: float = float(e.get("speed", 1.0))
	var slow: float = clampf(float(e.get("slow_amount", 0.0)), 0.0, 1.0)
	if slow >= 1.0:
		return # frozen
	e["move_acc"] = float(e.get("move_acc", 0.0)) + speed * (1.0 - slow) * TICK_DT
	while float(e["move_acc"]) >= 1.0:
		e["move_acc"] = float(e["move_acc"]) - 1.0
		if bool(e.get("flying", false)):
			_step_flying(e)
		else:
			_step_ground(e)
		if bool(e.get("reached_exit", false)):
			return


func _step_ground(e: Dictionary) -> void:
	var cell: Vector2i = e["cell"]
	if cell == grid.exit_cell:
		e["reached_exit"] = true
		return
	var next: Vector2i = grid.next_ground_step(cell)
	if next == cell:
		if cell == grid.exit_cell:
			e["reached_exit"] = true
		return
	e["cell"] = next
	e["pos"] = Vector2(next) + Vector2(0.5, 0.5)
	if next == grid.exit_cell:
		e["reached_exit"] = true


func _step_flying(e: Dictionary) -> void:
	var cell: Vector2i = e["cell"]
	if cell == grid.exit_cell:
		e["reached_exit"] = true
		return
	var next: Vector2i = grid.next_air_step(cell)
	e["cell"] = next
	e["pos"] = Vector2(next) + Vector2(0.5, 0.5)
	if next == grid.exit_cell:
		e["reached_exit"] = true
