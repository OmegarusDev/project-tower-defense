class_name FxPainter
extends RefCounted
## Lightweight procedural FX frames (pulse rings, hit sparks) — generated, not assets.


static func pulse_ring(palette: ProcPalette, damage_type: String, size: int, t: float) -> Image:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var col := palette.damage(damage_type)
	col.a = clampf(1.0 - t, 0.0, 1.0) * 0.8
	var cx := size / 2
	var cy := size / 2
	var r := int(lerp(4.0, float(size / 2 - 2), clampf(t, 0.0, 1.0)))
	_ring(img, cx, cy, r, 2, col)
	return img


static func _ring(img: Image, cx: int, cy: int, r: int, thickness: int, col: Color) -> void:
	var r2 := r * r
	var inner := maxi(0, r - thickness)
	var i2 := inner * inner
	for py in range(cy - r - 1, cy + r + 2):
		for px in range(cx - r - 1, cx + r + 2):
			var d2 := (px - cx) * (px - cx) + (py - cy) * (py - cy)
			if d2 <= r2 and d2 >= i2:
				if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
					img.set_pixel(px, py, col)
