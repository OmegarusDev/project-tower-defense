extends SceneTree
## Headless assertions. Run: godot --headless --path . -s res://tests/test_sim.gd


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var failed: int = 0
	failed += 0 if _test_distance_field_path() else 1
	failed += 0 if _test_air_ignores_walls() else 1
	failed += 0 if _test_place_seal_rejected() else 1
	failed += 0 if _test_sell_refund() else 1
	failed += 0 if _test_attack_plan_trap_pulse() else 1
	failed += 0 if _test_attack_plan_commander_aura() else 1
	failed += 0 if _test_xp_level_point() else 1
	failed += 0 if _test_bake_and_synth() else 1
	if failed == 0:
		print("ALL TESTS PASSED")
		quit(0)
	else:
		print("TESTS FAILED: ", failed)
		quit(1)


func _test_distance_field_path() -> bool:
	var g: BoardGrid = BoardGrid.new()
	g.setup(7, 9)
	g.recompute_fields()
	if not g.has_ground_path():
		print("FAIL: no path on empty grid")
		return false
	var cell: Vector2i = g.spawn_cell
	var steps: int = 0
	while cell != g.exit_cell and steps < 64:
		var nxt: Vector2i = g.next_ground_step(cell)
		if nxt == cell:
			print("FAIL: stuck in distance field")
			return false
		cell = nxt
		steps += 1
	print("OK distance_field_path steps=", steps)
	return cell == g.exit_cell


func _test_air_ignores_walls() -> bool:
	var g: BoardGrid = BoardGrid.new()
	g.setup(5, 6)
	for x in g.cols:
		g.set_blocked(Vector2i(x, 2), true)
	g.recompute_fields()
	if g.has_ground_path():
		print("FAIL: ground should be sealed")
		return false
	if g.air_dist[g.idx(g.spawn_cell)] >= BoardGrid.INF:
		print("FAIL: air should path over walls")
		return false
	print("OK air_ignores_walls")
	return true


func _test_place_seal_rejected() -> bool:
	var w: SimWorld = SimWorld.new()
	w.setup(5, 6)
	w.set_roster(RosterBuilder.default_slots())
	for x in w.grid.cols:
		if x == w.grid.spawn_cell.x:
			continue
		w.grid.set_blocked(Vector2i(x, 2), true)
	w.grid.recompute_fields()
	var res: Dictionary = w.try_place_wall(Vector2i(w.grid.spawn_cell.x, 2))
	if res.get("ok", true):
		print("FAIL: sealing wall should be rejected")
		return false
	print("OK place_seal_rejected")
	return true


func _test_sell_refund() -> bool:
	var w: SimWorld = SimWorld.new()
	w.setup(9, 10)
	w.set_roster(RosterBuilder.default_slots())
	w.economy.battle = 500
	var before: int = w.economy.battle
	var place: Dictionary = w.try_place_tower(Vector2i(4, 4), 0)
	if not place.get("ok", false):
		print("FAIL: place tower ", place)
		return false
	var paid: int = int(place["tower"]["paid"])
	var sell: Dictionary = w.try_sell_tower(int(place["tower"]["id"]))
	var expected: int = before - paid + int(paid * 0.5)
	if w.economy.battle != expected:
		print("FAIL: refund got ", w.economy.battle, " expected ", expected)
		return false
	print("OK sell_refund")
	return sell.get("ok", false)


func _test_attack_plan_trap_pulse() -> bool:
	var plan: AttackPlan = AttackPlan.from_loadout("trap", "radius", "pellet", 1, PartsFallback.data())
	if plan.pattern != AttackPlan.Pattern.PULSE:
		print("FAIL: trap+radius should be PULSE got ", plan.pattern)
		return false
	if plan.pulse_radius < 1.5:
		print("FAIL: pulse radius too small")
		return false
	print("OK attack_plan_trap_pulse r=", plan.pulse_radius)
	return true


func _test_attack_plan_commander_aura() -> bool:
	var plan: AttackPlan = AttackPlan.from_loadout("commander", "single", "pellet", 1, PartsFallback.data())
	if not plan.provides_aura:
		print("FAIL: commander should provide aura")
		return false
	print("OK attack_plan_commander_aura")
	return true


func _test_xp_level_point() -> bool:
	var w: SimWorld = SimWorld.new()
	w.setup(9, 10)
	w.set_roster(RosterBuilder.default_slots())
	w.economy.battle = 500
	var place: Dictionary = w.try_place_tower(Vector2i(3, 3), 0)
	var t: Dictionary = place["tower"]
	t["xp_to_point"] = 5.0
	t["level_cap"] = 5
	w.combat._grant_xp(t, 12.0)
	if int(t["level_points"]) < 2:
		print("FAIL: expected level points from XP overflow")
		return false
	var spent: Dictionary = w.spend_level_point(int(t["id"]))
	if not spent.get("ok", false):
		print("FAIL: spend point ", spent)
		return false
	print("OK xp_level_point level=", t["level"])
	return int(t["level"]) == 2


func _test_bake_and_synth() -> bool:
	var pal: ProcPalette = ProcPalette.new()
	pal.build_default()
	var bake: BakeCache = BakeCache.new()
	bake.setup(pal)
	var tex: Texture2D = bake.tower_texture("watchtower", "single", "pellet", 1)
	if tex == null:
		print("FAIL: bake texture null")
		return false
	var synth: SynthBank = SynthBank.new()
	synth.bake_all()
	if not synth._streams.has("shot"):
		print("FAIL: synth missing shot")
		return false
	var score: ScoreEngine = ScoreEngine.new()
	score.setup(60.0)
	score.set_wave(10)
	if score._beat_period <= 0.0:
		print("FAIL: score tempo")
		return false
	print("OK bake_and_synth")
	return true
