class_name MapGen
extends RefCounted
## Seeded campaign maps + endless blank grids. Pre-walls validated for ground path.


static func endless_start(cols: int = 11, rows: int = 14) -> Dictionary:
	return {"cols": cols, "rows": rows, "blocked": [], "seed": 1}


static func campaign_level(seed_value: int, cols: int = 13, rows: int = 18, wall_attempts: int = 18) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var grid := BoardGrid.new()
	grid.setup(cols, rows)
	var placed: Array[Vector2i] = []
	for _i in wall_attempts:
		var c := Vector2i(rng.randi_range(1, cols - 2), rng.randi_range(2, rows - 3))
		if c == grid.spawn_cell or c == grid.exit_cell:
			continue
		if grid.is_blocked(c):
			continue
		grid.set_blocked(c, true)
		if grid.has_ground_path():
			placed.append(c)
		else:
			grid.set_blocked(c, false)
	return {
		"cols": cols,
		"rows": rows,
		"seed": seed_value,
		"blocked": placed,
	}


static func apply_blocked(grid: BoardGrid, cells: Array) -> void:
	for c in cells:
		var cell: Vector2i = c
		grid.set_blocked(cell, true)
	grid.recompute_fields()
