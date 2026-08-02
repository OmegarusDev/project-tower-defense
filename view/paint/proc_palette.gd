class_name ProcPalette
extends RefCounted
## Procedural color ramps + optional colorblind LUT (default off).

var colorblind: bool = false
var bg: Color = Color("1a1f2e")
var grid_line: Color = Color("2a3348")
var path_ghost: Color = Color(0.3, 0.75, 1.0, 0.35)
var wall: Color = Color("5c6b7a")
var spawn: Color = Color("3dffa8")
var exit_c: Color = Color("ff6b6b")
var ui_text: Color = Color("e8eef7")
var ui_dim: Color = Color("8a93a6")
var accent: Color = Color("4a9eff")

var damage_colors: Dictionary = {}
var base_colors: Dictionary = {}
var enemy_colors: Dictionary = {}

var _lut: Dictionary = {}


func build_default() -> void:
	damage_colors = {
		"kinetic": Color("d0d6e0"),
		"fire": Color("ff7a3d"),
		"shock": Color("7ec8ff"),
		"frost": Color("a8e0ff"),
	}
	base_colors = {
		"watchtower": Color("6aa9ff"),
		"bunker": Color("8b9bb4"),
		"sniper": Color("c9a227"),
		"trap": Color("e07a5f"),
		"commander": Color("b388ff"),
	}
	enemy_colors = {
		"basic": Color("e85d75"),
		"heavy": Color("a33b5a"),
		"fast": Color("ff9f1c"),
		"flying": Color("9b5de5"),
		"shielded": Color("00bbf9"),
		"splitter": Color("f15bb5"),
		"boss": Color("ff006e"),
	}
	_build_colorblind_lut()


func set_colorblind(enabled: bool) -> void:
	colorblind = enabled


func c(key_color: Color) -> Color:
	if not colorblind:
		return key_color
	var k := key_color.to_html(false)
	if _lut.has(k):
		return _lut[k]
	# Approximate deuteranomaly-safe remap
	var remapped := Color(
		clampf(key_color.r * 0.8 + key_color.g * 0.2, 0.0, 1.0),
		clampf(key_color.g * 0.6 + key_color.b * 0.4, 0.0, 1.0),
		clampf(key_color.b * 0.7 + key_color.r * 0.3, 0.0, 1.0),
		key_color.a
	)
	_lut[k] = remapped
	return remapped


func damage(type_id: String) -> Color:
	return c(damage_colors.get(type_id, damage_colors["kinetic"]))


func base(base_id: String) -> Color:
	return c(base_colors.get(base_id, accent))


func enemy(kind: String) -> Color:
	return c(enemy_colors.get(kind, enemy_colors["basic"]))


func _build_colorblind_lut() -> void:
	_lut.clear()
