class_name SaveStore
extends RefCounted
## Versioned local saves — meta + endless checkpoint. Schema ready to grow.

const PATH_META := "user://meta_v1.json"
const PATH_ENDLESS := "user://endless_checkpoint_v1.json"
const SCHEMA := 1


static func load_meta() -> Dictionary:
	var d := _read(PATH_META)
	if d.is_empty():
		return {
			"schema": SCHEMA,
			"aether": 0,
			"forge": 0,
			"owned": RosterBuilder.default_owned(),
			"slot_count": 3,
			"level_cap": 1,
			"best_wave": 0,
			"settings": {"colorblind": false, "particles": true, "vol_music": 0.7, "vol_sfx": 0.7, "vol_ui": 0.7},
		}
	return d


static func save_meta(data: Dictionary) -> void:
	data["schema"] = SCHEMA
	_write(PATH_META, data)


static func has_endless_checkpoint() -> bool:
	return FileAccess.file_exists(PATH_ENDLESS)


static func save_endless(blob: Dictionary) -> void:
	blob["schema"] = SCHEMA
	_write(PATH_ENDLESS, blob)


static func load_endless() -> Dictionary:
	return _read(PATH_ENDLESS)


static func clear_endless() -> void:
	if FileAccess.file_exists(PATH_ENDLESS):
		var dir := DirAccess.open("user://")
		if dir:
			dir.remove("endless_checkpoint_v1.json")


static func _read(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) == TYPE_DICTIONARY:
		return parsed
	return {}


static func _write(path: String, data: Dictionary) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		push_warning("SaveStore: cannot write %s" % path)
		return
	f.store_string(JSON.stringify(data))
