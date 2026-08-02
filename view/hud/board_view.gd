class_name BoardView
extends Node2D
## Board renderer + placement input. Tools driven by parent UI.

signal cell_tapped(cell: Vector2i)
signal cell_hovered(cell: Vector2i)

var palette: ProcPalette
var bake: BakeCache
var sim: SimWorld
var cell_size: float = 44.0
var origin: Vector2 = Vector2(16, 168)
var hover_cell: Vector2i = Vector2i(-1, -1)
var ghost_ok: bool = false
var tool_mode: String = "tower" # tower | wall | select
var selected_slot: int = 0
var selected_tower_id: int = -1
var status_flash: String = ""
var input_enabled: bool = true


func setup(p_palette: ProcPalette, p_bake: BakeCache, p_sim: SimWorld) -> void:
	palette = p_palette
	bake = p_bake
	sim = p_sim
	_fit_cell_size()


func _fit_cell_size() -> void:
	if sim == null or sim.grid == null:
		return
	var view_w := 720.0 - 32.0
	var view_h := 1280.0 - 320.0
	cell_size = minf(view_w / float(sim.grid.cols), view_h / float(sim.grid.rows))
	cell_size = clampf(cell_size, 28.0, 56.0)
	var board_w := cell_size * float(sim.grid.cols)
	origin = Vector2((720.0 - board_w) * 0.5, 168.0)


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if sim == null or sim.grid == null or palette == null:
		return
	_fit_cell_size()
	var g: BoardGrid = sim.grid
	draw_rect(Rect2(origin, Vector2(g.cols, g.rows) * cell_size), palette.c(palette.bg), true)
	for y in g.rows:
		for x in g.cols:
			var r := Rect2(origin + Vector2(x, y) * cell_size, Vector2(cell_size, cell_size))
			draw_rect(r, palette.c(palette.grid_line), false, 1.0)

	# Path ghost
	var cell: Vector2i = g.spawn_cell
	for _i in 80:
		var c0 := _cell_center(cell)
		var next: Vector2i = g.next_ground_step(cell)
		draw_line(c0, _cell_center(next), palette.c(palette.path_ghost), 3.0)
		if next == cell or next == g.exit_cell:
			break
		cell = next

	_draw_marker(g.spawn_cell, palette.c(palette.spawn))
	_draw_marker(g.exit_cell, palette.c(palette.exit_c))

	var wall_tex := bake.wall_texture()
	for w in sim.walls:
		draw_texture_rect(wall_tex, _cell_rect(w["cell"]), false)

	for t in sim.towers:
		var tex := bake.tower_texture(str(t["base"]), str(t["barrel"]), str(t["payload"]), int(t["level"]))
		draw_texture_rect(tex, _cell_rect(t["cell"]), false)
		# XP / level pip
		if int(t.get("level_points", 0)) > 0:
			draw_circle(_cell_center(t["cell"]) + Vector2(cell_size * 0.3, -cell_size * 0.3), 5.0, palette.accent)
		if int(t["id"]) == selected_tower_id:
			draw_rect(_cell_rect(t["cell"]).grow(-2), Color(1, 1, 1, 0.35), false, 2.0)
			var plan := AttackPlan.from_loadout(str(t["base"]), str(t["barrel"]), str(t["payload"]), int(t["level"]), sim.combat.parts)
			draw_arc(_cell_center(t["cell"]), plan.range_cells * cell_size, 0, TAU, 48, Color(0.4, 0.8, 1, 0.35), 2.0)

	for e in sim.enemies:
		var tex := bake.enemy_texture(str(e["kind"]))
		var pos: Vector2 = e.get("pos", Vector2(e["cell"]) + Vector2(0.5, 0.5))
		var p := origin + (pos - Vector2(0.5, 0.5)) * cell_size
		var sz := Vector2(cell_size, cell_size) * 0.8
		draw_texture_rect(tex, Rect2(p + Vector2(cell_size * 0.1, cell_size * 0.1), sz), false)
		# HP bar
		var hp_ratio := clampf(float(e["hp"]) / maxf(1.0, float(e["max_hp"])), 0.0, 1.0)
		var bar := Rect2(p + Vector2(4, 2), Vector2((cell_size - 8) * hp_ratio, 3))
		draw_rect(bar, Color(0.2, 0.9, 0.4), true)

	for p in sim.projectiles:
		var screen := origin + Vector2(p["pos"]) * cell_size
		draw_circle(screen, 3.5, palette.damage(str(p.get("damage_type", "kinetic"))))

	# Hover ghost
	if hover_cell.x >= 0 and g.in_bounds(hover_cell) and tool_mode != "select":
		var col := Color(0.3, 1.0, 0.5, 0.35) if ghost_ok else Color(1.0, 0.3, 0.3, 0.35)
		draw_rect(_cell_rect(hover_cell), col, true)

	if status_flash != "":
		draw_string(ThemeDB.fallback_font, origin + Vector2(8, -18), status_flash, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, palette.ui_text)


func _cell_rect(cell: Vector2i) -> Rect2:
	return Rect2(origin + Vector2(cell) * cell_size, Vector2(cell_size, cell_size))


func _cell_center(cell: Vector2i) -> Vector2:
	return origin + (Vector2(cell) + Vector2(0.5, 0.5)) * cell_size


func _draw_marker(cell: Vector2i, col: Color) -> void:
	draw_rect(_cell_rect(cell).grow(-6), col, true)


func _gui_input_from_mouse(event: InputEvent) -> void:
	if not input_enabled or sim == null:
		return
	var pos: Vector2
	if event is InputEventMouse:
		pos = (event as InputEventMouse).position
	else:
		return
	var local := pos # BoardView is under root; use canvas transform
	local = get_global_transform_with_canvas().affine_inverse() * pos
	var cell := Vector2i(
		floori((local.x - origin.x) / cell_size),
		floori((local.y - origin.y) / cell_size)
	)
	if event is InputEventMouseMotion:
		hover_cell = cell
		ghost_ok = _can_place(cell)
		cell_hovered.emit(cell)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if sim.grid.in_bounds(cell):
			cell_tapped.emit(cell)


func _unhandled_input(event: InputEvent) -> void:
	_gui_input_from_mouse(event)


func _can_place(cell: Vector2i) -> bool:
	if sim == null or not sim.grid.in_bounds(cell):
		return false
	if tool_mode == "select":
		return true
	return sim.grid.is_buildable(cell)
