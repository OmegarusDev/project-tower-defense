class_name EnemyPainter
extends RefCounted


static func paint(palette: ProcPalette, kind: String, size: int) -> Image:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var col := palette.enemy(kind)
	var cx := size / 2
	var cy := size / 2
	match kind:
		"heavy":
			_rect(img, cx - 16, cy - 14, 32, 28, col)
		"fast":
			_tri(img, cx, cy - 14, cx - 14, cy + 12, cx + 14, cy + 12, col)
		"flying":
			_circle(img, cx, cy, 12, col)
			_rect(img, cx - 18, cy - 2, 12, 4, col.lightened(0.2))
			_rect(img, cx + 6, cy - 2, 12, 4, col.lightened(0.2))
		"boss":
			_circle(img, cx, cy, 18, col)
			_rect(img, cx - 6, cy - 6, 12, 12, col.darkened(0.25))
		_:
			_circle(img, cx, cy, 12, col)
	return img


static func _rect(img: Image, x: int, y: int, w: int, h: int, col: Color) -> void:
	for py in range(y, y + h):
		for px in range(x, x + w):
			if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
				img.set_pixel(px, py, col)


static func _circle(img: Image, cx: int, cy: int, r: int, col: Color) -> void:
	var r2 := r * r
	for py in range(cy - r, cy + r + 1):
		for px in range(cx - r, cx + r + 1):
			if (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r2:
				if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
					img.set_pixel(px, py, col)


static func _tri(img: Image, x0: int, y0: int, x1: int, y1: int, x2: int, y2: int, col: Color) -> void:
	var minx := mini(x0, mini(x1, x2))
	var maxx := maxi(x0, maxi(x1, x2))
	var miny := mini(y0, mini(y1, y2))
	var maxy := maxi(y0, maxi(y1, y2))
	for py in range(miny, maxy + 1):
		for px in range(minx, maxx + 1):
			if _inside(px, py, x0, y0, x1, y1, x2, y2):
				if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
					img.set_pixel(px, py, col)


static func _inside(px: int, py: int, x0: int, y0: int, x1: int, y1: int, x2: int, y2: int) -> bool:
	var d1 := (px - x1) * (y0 - y1) - (x0 - x1) * (py - y1)
	var d2 := (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
	var d3 := (px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)
	var has_neg := (d1 < 0) or (d2 < 0) or (d3 < 0)
	var has_pos := (d1 > 0) or (d2 > 0) or (d3 > 0)
	return not (has_neg and has_pos)
