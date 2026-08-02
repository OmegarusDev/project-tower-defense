class_name ScreenStateMachine
extends Node
## Playable Endless prototype shell. Campaign/meta stubs leave extension points.

enum Screen { MAIN_MENU, ENDLESS_HUB, IN_GAME, GAME_OVER, SETTINGS }

var app: Node
var current: int = Screen.MAIN_MENU
var sim: SimWorld
var board_view: BoardView
var meta: Dictionary = {}

var _hud: CanvasLayer
var _label: Label
var _status: Label
var _compose_panel: PanelContainer
var _compose_open: bool = false
var _tool: String = "tower"
var _slot: int = 0
var _selected_tower_id: int = -1
var _speed: float = 1.0
var _accum: float = 0.0
var _paused: bool = false
var _feedback_t: float = 0.0


func setup(p_app: Node) -> void:
	app = p_app
	meta = SaveStore.load_meta()
	app.palette.set_colorblind(bool(meta.get("settings", {}).get("colorblind", false)))


func go_to(screen: int) -> void:
	current = screen
	_clear_ui()
	set_process(screen == Screen.IN_GAME)
	match screen:
		Screen.MAIN_MENU:
			_show_main()
		Screen.ENDLESS_HUB:
			_show_endless_hub()
		Screen.IN_GAME:
			_show_in_game()
		Screen.GAME_OVER:
			_show_game_over()
		Screen.SETTINGS:
			_show_settings()
		_:
			_show_main()


func _clear_ui() -> void:
	for c in get_children():
		c.queue_free()
	_hud = null
	board_view = null
	_compose_panel = null
	_label = null
	_status = null


func _show_main() -> void:
	var layer := _full_layer()
	var root := _centered_col(layer)
	_title(root, "Project Tower Defense")
	_hint(root, "Compose towers. Shape the path. Survive.")
	_btn(root, "Endless", func(): go_to(Screen.ENDLESS_HUB))
	_btn(root, "Campaign (coming next)", func(): _toast_main(root, "Campaign Prep ships in the next stage."))
	_btn(root, "Settings", func(): go_to(Screen.SETTINGS))
	_hint(root, "Aether %d  ·  Forge %d  ·  Best wave %d" % [
		int(meta.get("aether", 0)), int(meta.get("forge", 0)), int(meta.get("best_wave", 0))
	])


func _show_endless_hub() -> void:
	var layer := _full_layer()
	var root := _centered_col(layer)
	_title(root, "Endless")
	_btn(root, "New Run", func(): _confirm_new_run())
	var cont := Button.new()
	cont.text = "Continue"
	cont.disabled = not SaveStore.has_endless_checkpoint()
	cont.pressed.connect(_continue_endless)
	root.add_child(cont)
	if cont.disabled:
		_hint(root, "No checkpoint yet — start a New Run.")
	else:
		var blob := SaveStore.load_endless()
		_hint(root, "Resume wave %d" % int(blob.get("wave", 1)))
	_btn(root, "Back", func(): go_to(Screen.MAIN_MENU))


func _confirm_new_run() -> void:
	if SaveStore.has_endless_checkpoint():
		# Simple confirm via replacing hub briefly
		_clear_ui()
		var layer := _full_layer()
		var root := _centered_col(layer)
		_title(root, "Overwrite run?")
		_hint(root, "This clears your endless checkpoint.")
		_btn(root, "Start New Run", func(): _start_endless(true))
		_btn(root, "Cancel", func(): go_to(Screen.ENDLESS_HUB))
	else:
		_start_endless(true)


func _start_endless(clear_checkpoint: bool) -> void:
	if clear_checkpoint:
		SaveStore.clear_endless()
	sim = SimWorld.new()
	sim.setup(11, 14, 1, true)
	sim.economy.inject_meta(int(meta.get("forge", 0)), int(meta.get("aether", 0)))
	var slots := RosterBuilder.default_slots(int(meta.get("slot_count", 3)), int(meta.get("level_cap", 1)))
	sim.set_roster(slots)
	if not sim.event_emitted.is_connected(_on_sim_event):
		sim.event_emitted.connect(_on_sim_event)
	_tool = "tower"
	_slot = 0
	_selected_tower_id = -1
	_speed = 1.0
	_paused = false
	_accum = 0.0
	go_to(Screen.IN_GAME)


func _continue_endless() -> void:
	var blob := SaveStore.load_endless()
	if blob.is_empty():
		go_to(Screen.ENDLESS_HUB)
		return
	sim = SimWorld.new()
	sim.load_checkpoint(blob)
	if not sim.event_emitted.is_connected(_on_sim_event):
		sim.event_emitted.connect(_on_sim_event)
	_toast("Checkpoint loaded — Call Early to resume wave %d" % sim.wave_index)
	go_to(Screen.IN_GAME)


func _show_settings() -> void:
	var layer := _full_layer()
	var root := _centered_col(layer)
	_title(root, "Settings")
	var cb := CheckButton.new()
	cb.text = "Colorblind palette (default off)"
	cb.button_pressed = bool(meta.get("settings", {}).get("colorblind", false))
	cb.toggled.connect(func(on: bool):
		if not meta.has("settings"):
			meta["settings"] = {}
		meta["settings"]["colorblind"] = on
		app.palette.set_colorblind(on)
		app.bake_cache.clear()
		SaveStore.save_meta(meta)
	)
	root.add_child(cb)
	var pt := CheckButton.new()
	pt.text = "Particles"
	pt.button_pressed = bool(meta.get("settings", {}).get("particles", true))
	pt.toggled.connect(func(on: bool):
		meta["settings"]["particles"] = on
		if board_view:
			board_view.particles_enabled = on
		SaveStore.save_meta(meta)
	)
	root.add_child(pt)
	_btn(root, "Back", func(): go_to(Screen.MAIN_MENU))


func _show_game_over() -> void:
	var layer := _full_layer()
	var root := _centered_col(layer)
	_title(root, "Run Over")
	_hint(root, "Reached wave %d" % sim.wave_index if sim else 0)
	_hint(root, "Kept Aether %d · Forge %d" % [int(meta.get("aether", 0)), int(meta.get("forge", 0))])
	_btn(root, "Endless Hub", func(): go_to(Screen.ENDLESS_HUB))
	_btn(root, "Main Menu", func(): go_to(Screen.MAIN_MENU))


func _show_in_game() -> void:
	board_view = BoardView.new()
	board_view.setup(app.palette, app.bake_cache, sim)
	board_view.particles_enabled = bool(meta.get("settings", {}).get("particles", true))
	board_view.cell_tapped.connect(_on_cell_tapped)
	add_child(board_view)

	_hud = CanvasLayer.new()
	add_child(_hud)

	var top := VBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 12
	top.offset_right = -12
	top.offset_top = 8
	_hud.add_child(top)

	_label = Label.new()
	_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_style_label(_label, 15)
	top.add_child(_label)
	_status = Label.new()
	_style_label(_status, 15)
	_status.add_theme_color_override("font_color", Color(1, 0.85, 0.4))
	top.add_child(_status)

	var tools := HBoxContainer.new()
	tools.add_theme_constant_override("separation", 6)
	top.add_child(tools)
	_tool_btn(tools, "Tower", "tower")
	_tool_btn(tools, "Wall", "wall")
	_tool_btn(tools, "Select", "select")
	_btn(tools, "Undo", _undo_last)

	var slots := HBoxContainer.new()
	top.add_child(slots)
	for i in sim.roster_snapshot.size():
		var idx := i
		var b := Button.new()
		b.text = "S%d" % (i + 1)
		b.toggle_mode = true
		b.button_pressed = i == _slot
		b.pressed.connect(func():
			_slot = idx
			_tool = "tower"
			_refresh_hud()
		)
		slots.add_child(b)

	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 6)
	top.add_child(actions)
	_btn(actions, "Call Early", _call_early)
	_btn(actions, "Compose", _toggle_compose)
	_btn(actions, "1x", func(): _set_speed(1.0))
	_btn(actions, "2x", func(): _set_speed(2.0))
	_btn(actions, "3x", func(): _set_speed(3.0))
	_btn(actions, "Pause", _toggle_pause)
	_btn(actions, "Menu", func():
		_paused = true
		go_to(Screen.ENDLESS_HUB)
	)

	var select_row := HBoxContainer.new()
	select_row.name = "SelectRow"
	top.add_child(select_row)
	_btn(select_row, "Level Up", _spend_point)
	_btn(select_row, "Sell", _sell_selected)
	_btn(select_row, "Target Cycle", _cycle_target)

	_build_compose_sheet()
	_refresh_hud()
	_toast("Place towers/walls, then Call Early. Path cannot be sealed.")


func _build_compose_sheet() -> void:
	_compose_panel = PanelContainer.new()
	_compose_panel.visible = false
	_compose_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_compose_panel.offset_top = -280
	_hud.add_child(_compose_panel)
	var box := VBoxContainer.new()
	_compose_panel.add_child(box)
	var hdr := Label.new()
	hdr.text = "Compose (live · 1x) — pick parts for selected slot"
	box.add_child(hdr)
	var row := HBoxContainer.new()
	box.add_child(row)
	_part_picker(row, "base", ["watchtower", "bunker", "sniper", "trap", "commander"])
	_part_picker(row, "barrel", ["single", "twin", "scatter", "radius", "long"])
	_part_picker(row, "payload", ["pellet", "explosive", "pyro", "electric", "frost"])
	_hint(box, "Prototype: all parts selectable. Forge gating comes with meta stage.")


func _part_picker(parent: Node, kind: String, options: Array) -> void:
	var col := VBoxContainer.new()
	parent.add_child(col)
	var lab := Label.new()
	lab.text = kind.capitalize()
	col.add_child(lab)
	for opt in options:
		var id := str(opt)
		var b := Button.new()
		b.text = id
		b.pressed.connect(func():
			_apply_part(kind, id)
			app.synth_bank.play("ui_click")
		)
		col.add_child(b)


func _apply_part(kind: String, id: String) -> void:
	if _slot < 0 or _slot >= sim.roster_snapshot.size():
		return
	var slot: Dictionary = sim.roster_snapshot[_slot]
	slot[kind] = id
	sim.roster_snapshot[_slot] = RosterBuilder.make_slot(
		str(slot.get("base", "")),
		str(slot.get("barrel", "")),
		str(slot.get("payload", "")),
		int(meta.get("level_cap", 1))
	)
	_toast("Slot %d = %s / %s / %s" % [
		_slot + 1,
		sim.roster_snapshot[_slot].get("base", "-"),
		sim.roster_snapshot[_slot].get("barrel", "-"),
		sim.roster_snapshot[_slot].get("payload", "-"),
	])
	_refresh_hud()


func _process(delta: float) -> void:
	if current != Screen.IN_GAME or sim == null:
		return
	if _feedback_t > 0.0:
		_feedback_t -= delta
		if _feedback_t <= 0.0 and board_view:
			board_view.status_flash = ""
	if _paused or not sim.running:
		if board_view:
			board_view.tool_mode = _tool
			board_view.selected_slot = _slot
			board_view.selected_tower_id = _selected_tower_id
		_refresh_hud()
		return

	var step := 1.0 / SimWorld.TICK_HZ
	var spd := 1.0 if _compose_open else _speed
	_accum += delta * spd
	var guard := 0
	while _accum >= step and guard < 8:
		_accum -= step
		sim.tick()
		guard += 1
	if board_view:
		board_view.tool_mode = _tool
		board_view.selected_slot = _slot
		board_view.selected_tower_id = _selected_tower_id
	_refresh_hud()


func _on_cell_tapped(cell: Vector2i) -> void:
	if _compose_open:
		return
	match _tool:
		"wall":
			var res := sim.try_place_wall(cell)
			_handle_place_result(res, "Wall")
		"tower":
			var res2 := sim.try_place_tower(cell, _slot)
			_handle_place_result(res2, "Tower")
		"select":
			_selected_tower_id = -1
			for t in sim.towers:
				if t["cell"] == cell:
					_selected_tower_id = int(t["id"])
					_toast("Selected tower L%d · points %d" % [int(t["level"]), int(t.get("level_points", 0))])
					break
			if _selected_tower_id < 0:
				for w in sim.walls:
					if w["cell"] == cell:
						_toast("Wall — use Sell with wall selected via Select+Sell later")
						break


func _handle_place_result(res: Dictionary, label: String) -> void:
	if res.get("ok", false):
		app.synth_bank.play("place")
		_toast("%s placed" % label)
		return
	var reason := str(res.get("reason", "failed"))
	match reason:
		"path_sealed":
			_toast("Can't seal the path")
		"need_battle":
			_toast("Need %d Battle" % int(res.get("need", 0)))
		"incomplete_triad":
			_toast("Compose a full triad in that slot first")
		"blocked":
			_toast("Cell blocked")
		_:
			_toast("%s failed: %s" % [label, reason])
	app.synth_bank.play("ui_click", 0.7)


var _undo_stack: Array[Dictionary] = []


func _on_sim_event(e: Dictionary) -> void:
	match str(e.get("kind", "")):
		"wave_checkpoint":
			SaveStore.save_endless(sim.checkpoint_blob())
		"tower_placed":
			_undo_stack.append({"kind": "tower", "id": e.get("tower", {}).get("id", -1)})
		"wall_placed":
			_undo_stack.append({"kind": "wall", "id": e.get("wall", {}).get("id", -1)})
		"tower_fired":
			app.synth_bank.play("shot", randf_range(0.95, 1.05))
		"hit":
			app.synth_bank.play("hit", randf_range(0.9, 1.1))
		"wave_cleared":
			app.synth_bank.play("ui_confirm")
			app.score_engine.set_wave(sim.wave_index)
			meta["aether"] = sim.economy.aether
			meta["forge"] = sim.economy.forge
			meta["best_wave"] = maxi(int(meta.get("best_wave", 0)), sim.wave_index)
			SaveStore.save_meta(meta)
			_toast("Wave %d cleared · Forge/Aether banked" % sim.wave_index)
			sim.running = false # wait for next Call Early
		"game_over":
			app.synth_bank.play("explode")
			meta["aether"] = sim.economy.aether
			meta["forge"] = sim.economy.forge
			meta["best_wave"] = maxi(int(meta.get("best_wave", 0)), sim.wave_index)
			SaveStore.save_meta(meta)
			SaveStore.clear_endless()
			go_to(Screen.GAME_OVER)
		"level_point_gained":
			_toast("Level-up point ready")


func _call_early() -> void:
	if sim.wave_manager.wave_active:
		_toast("Wave already in progress")
		return
	_paused = false
	sim.start_wave()
	app.synth_bank.play("wave")
	app.score_engine.set_wave(sim.wave_index)
	_toast("Wave %d" % sim.wave_index)


func _toggle_compose() -> void:
	_compose_open = not _compose_open
	if _compose_panel:
		_compose_panel.visible = _compose_open
	if _compose_open:
		_set_speed(1.0)
		app.score_engine.set_sim_speed(1.0)
		app.synth_bank.play("ui_click")
		_toast("Compose open — sim forced to 1x")
	_refresh_hud()


func _set_speed(s: float) -> void:
	if _compose_open:
		s = 1.0
	_speed = s
	sim.speed_mult = s
	app.score_engine.set_sim_speed(s)


func _toggle_pause() -> void:
	_paused = not _paused
	_toast("Paused" if _paused else "Resumed")


func _undo_last() -> void:
	if _undo_stack.is_empty():
		_toast("Nothing to undo")
		return
	var last: Dictionary = _undo_stack.pop_back()
	if str(last.get("kind")) == "tower":
		sim.try_sell_tower(int(last.get("id", -1)))
	else:
		sim.try_sell_wall(int(last.get("id", -1)))
	app.synth_bank.play("sell")
	_toast("Undid last place")


func _spend_point() -> void:
	if _selected_tower_id < 0:
		_toast("Select a tower first")
		return
	var res := sim.spend_level_point(_selected_tower_id)
	if res.get("ok", false):
		app.synth_bank.play("ui_confirm")
		_toast("Tower leveled")
	else:
		_toast(str(res.get("reason", "can't level")))


func _sell_selected() -> void:
	if _selected_tower_id < 0:
		_toast("Select a tower first")
		return
	var res := sim.try_sell_tower(_selected_tower_id)
	if res.get("ok", false):
		app.synth_bank.play("sell")
		_selected_tower_id = -1
		_toast("Sold (+%d Battle)" % int(res.get("refund", 0)))
	else:
		_toast("Sell failed")


func _cycle_target() -> void:
	if _selected_tower_id < 0:
		_toast("Select a tower first")
		return
	var order := ["first", "last", "strongest", "weakest", "closest"]
	for t in sim.towers:
		if int(t["id"]) != _selected_tower_id:
			continue
		var cur := str(t.get("targeting", "first"))
		var i := order.find(cur)
		t["targeting"] = order[(i + 1) % order.size()]
		_toast("Targeting: %s" % t["targeting"])
		return


func _refresh_hud() -> void:
	if _label == null or sim == null:
		return
	var slot_txt := "-"
	if _slot < sim.roster_snapshot.size():
		var s: Dictionary = sim.roster_snapshot[_slot]
		slot_txt = "%s/%s/%s (%d)" % [s.get("base", "-"), s.get("barrel", "-"), s.get("payload", "-"), int(s.get("place_cost", 0))]
	_label.text = "Wave %d | Lives %d | Battle %d | Forge %d | Aether %d | %s | Slot%d %s%s" % [
		sim.wave_index,
		sim.lives,
		sim.economy.battle,
		sim.economy.forge,
		sim.economy.aether,
		_tool.to_upper(),
		_slot + 1,
		slot_txt,
		" | COMPOSE" if _compose_open else (" | PAUSE" if _paused else ""),
	]


func _toast(msg: String) -> void:
	if _status:
		_status.text = msg
	if board_view:
		board_view.status_flash = msg
	_feedback_t = 2.2


func _toast_main(root: Node, msg: String) -> void:
	var l := Label.new()
	l.text = msg
	root.add_child(l)


func _full_layer() -> CanvasLayer:
	var layer := CanvasLayer.new()
	add_child(layer)
	var bg := ColorRect.new()
	bg.color = Color("1a2233")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(bg)
	return layer


func _centered_col(layer: CanvasLayer) -> VBoxContainer:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 32)
	margin.add_theme_constant_override("margin_right", 32)
	margin.add_theme_constant_override("margin_top", 96)
	margin.add_theme_constant_override("margin_bottom", 32)
	layer.add_child(margin)
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 16)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	margin.add_child(root)
	return root


func _style_label(l: Label, size: int = 18) -> void:
	l.add_theme_color_override("font_color", Color(0.95, 0.96, 0.98))
	l.add_theme_font_size_override("font_size", size)


func _style_button(b: Button) -> void:
	b.custom_minimum_size = Vector2(0, 48)
	b.add_theme_color_override("font_color", Color(0.95, 0.96, 0.98))
	b.add_theme_color_override("font_hover_color", Color(1, 1, 1))
	b.add_theme_color_override("font_pressed_color", Color(0.8, 0.9, 1))
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color("2d4a6f")
	sb.set_corner_radius_all(8)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	b.add_theme_stylebox_override("normal", sb)
	var sb_h := sb.duplicate()
	sb_h.bg_color = Color("3a6ea5")
	b.add_theme_stylebox_override("hover", sb_h)
	var sb_p := sb.duplicate()
	sb_p.bg_color = Color("1e3a5f")
	b.add_theme_stylebox_override("pressed", sb_p)


func _title(parent: Node, text: String) -> void:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_style_label(l, 28)
	parent.add_child(l)


func _hint(parent: Node, text: String) -> void:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_style_label(l, 16)
	l.add_theme_color_override("font_color", Color(0.75, 0.8, 0.88))
	parent.add_child(l)


func _btn(parent: Node, text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	_style_button(b)
	b.pressed.connect(cb)
	parent.add_child(b)


func _tool_btn(parent: Node, text: String, tool_id: String) -> void:
	var b := Button.new()
	b.text = text
	_style_button(b)
	b.pressed.connect(func():
		_tool = tool_id
		_toast("Tool: %s" % tool_id)
		_refresh_hud()
	)
	parent.add_child(b)
