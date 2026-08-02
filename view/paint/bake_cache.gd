class_name BakeCache
extends RefCounted
## Bakes procedural tower/enemy/UI icons to ImageTextures; invalidate on loadout/level.

var palette: ProcPalette
var _tower_cache: Dictionary = {} # key -> Texture2D
var _enemy_cache: Dictionary = {}
var _icon_cache: Dictionary = {}
var cell_px: int = 64


func setup(p_palette: ProcPalette) -> void:
	palette = p_palette


func clear() -> void:
	_tower_cache.clear()
	_enemy_cache.clear()
	_icon_cache.clear()


func tower_texture(base_id: String, barrel_id: String, payload_id: String, level: int = 1) -> Texture2D:
	var key := "%s|%s|%s|%d|cb=%s" % [base_id, barrel_id, payload_id, level, str(palette.colorblind)]
	if _tower_cache.has(key):
		return _tower_cache[key]
	var img := TowerPainter.paint(palette, base_id, barrel_id, payload_id, level, cell_px)
	var tex := ImageTexture.create_from_image(img)
	_tower_cache[key] = tex
	return tex


func enemy_texture(kind: String) -> Texture2D:
	var key := "%s|cb=%s" % [kind, str(palette.colorblind)]
	if _enemy_cache.has(key):
		return _enemy_cache[key]
	var img := EnemyPainter.paint(palette, kind, cell_px)
	var tex := ImageTexture.create_from_image(img)
	_enemy_cache[key] = tex
	return tex


func wall_texture() -> Texture2D:
	var key := "wall|cb=%s" % str(palette.colorblind)
	if _icon_cache.has(key):
		return _icon_cache[key]
	var img := WallPainter.paint(palette, cell_px)
	var tex := ImageTexture.create_from_image(img)
	_icon_cache[key] = tex
	return tex


func invalidate_tower(base_id: String, barrel_id: String, payload_id: String, level: int) -> void:
	var key := "%s|%s|%s|%d|cb=%s" % [base_id, barrel_id, payload_id, level, str(palette.colorblind)]
	_tower_cache.erase(key)
