class_name WallPainter
extends RefCounted


static func paint(palette: ProcPalette, size: int) -> Image:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var col := palette.c(palette.wall)
	var m := 8
	for py in range(m, size - m):
		for px in range(m, size - m):
			var edge := px == m or py == m or px == size - m - 1 or py == size - m - 1
			img.set_pixel(px, py, col.lightened(0.15) if edge else col)
	return img
