class_name TowerPainter
extends RefCounted
## Shape-grammar tower bake — base silhouette + barrel + payload accent. Zero external assets.


static func paint(palette: ProcPalette, base_id: String, barrel_id: String, payload_id: String, level: int, size: int) -> Image:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var base_c := palette.base(base_id)
	var payload_c := palette.damage(_payload_type(payload_id))
	var cx := size / 2
	var cy := size / 2 + 4

	# Base body
	match base_id:
		"bunker":
			_fill_rect(img, cx - 18, cy - 10, 36, 28, base_c)
			_fill_rect(img, cx - 14, cy - 6, 28, 20, base_c.darkened(0.15))
		"sniper":
			_fill_rect(img, cx - 12, cy - 8, 24, 24, base_c)
			_fill_rect(img, cx - 4, cy - 22, 8, 18, base_c.lightened(0.1))
		"trap":
			_fill_circle(img, cx, cy, 16, base_c)
			_fill_circle(img, cx, cy, 10, base_c.darkened(0.2))
		"commander":
			_fill_rect(img, cx - 16, cy - 12, 32, 26, base_c)
			_fill_circle(img, cx, cy - 4, 8, base_c.lightened(0.2))
		_:
			_fill_rect(img, cx - 14, cy - 12, 28, 26, base_c)
			_fill_rect(img, cx - 10, cy - 8, 20, 18, base_c.darkened(0.12))

	# Barrel / turret
	var barrel_c := base_c.lightened(0.25)
	match barrel_id:
		"twin":
			_fill_rect(img, cx - 10, cy - 20, 5, 16, barrel_c)
			_fill_rect(img, cx + 5, cy - 20, 5, 16, barrel_c)
		"scatter":
			_fill_rect(img, cx - 2, cy - 22, 4, 18, barrel_c)
			_fill_rect(img, cx - 10, cy - 16, 4, 10, barrel_c.darkened(0.05))
			_fill_rect(img, cx + 6, cy - 16, 4, 10, barrel_c)
		"radius":
			_fill_circle(img, cx, cy - 8, 7, payload_c)
		"long":
			_fill_rect(img, cx - 2, cy - 28, 4, 26, barrel_c)
		_:
			_fill_rect(img, cx - 2, cy - 22, 4, 18, barrel_c)

	# Payload gem
	_fill_circle(img, cx, cy + 2, 4 + mini(3, level - 1), payload_c)

	# Level pips
	for i in mini(5, level):
		_fill_rect(img, 4 + i * 6, size - 8, 4, 4, palette.accent)

	return img


static func _payload_type(payload_id: String) -> String:
	match payload_id:
		"pyro":
			return "fire"
		"electric":
			return "shock"
		"frost":
			return "frost"
		_:
			return "kinetic"


static func _fill_rect(img: Image, x: int, y: int, w: int, h: int, col: Color) -> void:
	for py in range(y, y + h):
		for px in range(x, x + w):
			if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
				img.set_pixel(px, py, col)


static func _fill_circle(img: Image, cx: int, cy: int, r: int, col: Color) -> void:
	var r2 := r * r
	for py in range(cy - r, cy + r + 1):
		for px in range(cx - r, cx + r + 1):
			var dx := px - cx
			var dy := py - cy
			if dx * dx + dy * dy <= r2:
				if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
					img.set_pixel(px, py, col)
