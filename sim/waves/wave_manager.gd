class_name WaveManager
extends RefCounted

var world: SimWorld
var spawn_timer: float = 0.0
var to_spawn: int = 0
var wave_active: bool = false
var spawned_this_wave: int = 0


func setup(p_world: SimWorld) -> void:
	world = p_world


func start_next_wave() -> void:
	world.wave_index += 1
	var w := world.wave_index
	to_spawn = int(8.0 * pow(1.12, float(w - 1)))
	spawned_this_wave = 0
	spawn_timer = 0.15
	wave_active = true
	# Checkpoint at wave start (app layer persists on this event).
	world.emit_event("wave_checkpoint", {"wave": w})
	world.emit_event("wave_composition", {"count": to_spawn, "wave": w})


func tick() -> void:
	if not wave_active:
		return
	if to_spawn > 0:
		spawn_timer -= SimWorld.TICK_DT
		if spawn_timer <= 0.0:
			_spawn_one()
			to_spawn -= 1
			spawned_this_wave += 1
			var delay := maxf(0.25, 1.0 * pow(0.97, float(world.wave_index - 1)))
			spawn_timer = delay
	elif world.enemies.is_empty():
		wave_active = false
		world.economy.on_wave_cleared(false)
		world.emit_event("wave_cleared", {"wave": world.wave_index})
		# Endless grid growth every 20 waves
		if world.mode_endless and world.wave_index % 20 == 0 and world.wave_index <= 100:
			if world.grid.rows < 28:
				world.grow_south(2)


func _spawn_one() -> void:
	var w := world.wave_index
	var kind := "basic"
	var roll := randf()
	if w >= 6 and roll < 0.12:
		kind = "flying"
	elif w >= 4 and roll < 0.25:
		kind = "heavy"
	elif w >= 3 and roll < 0.4:
		kind = "fast"
	var e := _make_enemy(kind, w)
	world.enemies.append(e)
	world.emit_event("enemy_spawned", {"enemy": e})


func _make_enemy(kind: String, wave: int) -> Dictionary:
	var hp_scale := pow(1.05, float(wave - 1))
	var e := {
		"id": world.alloc_id(),
		"kind": kind,
		"cell": world.grid.spawn_cell,
		"pos": Vector2(world.grid.spawn_cell) + Vector2(0.5, 0.5),
		"hp": 28.0 * hp_scale,
		"max_hp": 28.0 * hp_scale,
		"speed": 0.85,
		"flying": false,
		"leak_damage": 1,
		"battle_drop": 3,
		"armor_flat": 0.0,
		"resist": {},
		"immune": [],
		"reached_exit": false,
		"move_acc": 0.0,
	}
	match kind:
		"heavy":
			e["hp"] = 70.0 * hp_scale
			e["max_hp"] = e["hp"]
			e["speed"] = 0.45
			e["leak_damage"] = 2
			e["battle_drop"] = 5
			e["armor_flat"] = 2.0
		"fast":
			e["hp"] = 16.0 * hp_scale
			e["max_hp"] = e["hp"]
			e["speed"] = 1.45
			e["battle_drop"] = 3
		"flying":
			e["flying"] = true
			e["hp"] = 20.0 * hp_scale
			e["max_hp"] = e["hp"]
			e["speed"] = 1.0
			e["battle_drop"] = 4
		"shielded":
			e["hp"] = 36.0 * hp_scale
			e["max_hp"] = e["hp"]
			e["resist"] = {"kinetic": 0.35}
			e["battle_drop"] = 4
		"splitter":
			e["hp"] = 24.0 * hp_scale
			e["max_hp"] = e["hp"]
			e["battle_drop"] = 3
		"boss":
			e["hp"] = 220.0 * hp_scale
			e["max_hp"] = e["hp"]
			e["leak_damage"] = 5
			e["battle_drop"] = 25
			e["armor_flat"] = 4.0
			e["speed"] = 0.4
	return e
