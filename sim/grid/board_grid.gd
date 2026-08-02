class_name BoardGrid
extends RefCounted
## Grid occupancy + exit distance fields (ground & air). Enemies follow the gradient — no per-enemy A*.

const INF := 1_000_000

var cols: int = 10
var rows: int = 12
var spawn_cell: Vector2i = Vector2i(5, 0)
var exit_cell: Vector2i = Vector2i(5, 11)

## true = blocked for ground (towers/walls)
var blocked: PackedByteArray = PackedByteArray()
## Distance to exit in steps; INF = unreachable
var ground_dist: PackedInt32Array = PackedInt32Array()
var air_dist: PackedInt32Array = PackedInt32Array()
## Next step toward exit for each cell (encoded as dx+1, dy+1 nibbles or parallel arrays)
var ground_next_x: PackedInt32Array = PackedInt32Array()
var ground_next_y: PackedInt32Array = PackedInt32Array()
var air_next_x: PackedInt32Array = PackedInt32Array()
var air_next_y: PackedInt32Array = PackedInt32Array()

const DIRS: Array[Vector2i] = [
	Vector2i(0, 1), Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, 0)
]


func setup(p_cols: int, p_rows: int) -> void:
	cols = p_cols
	rows = p_rows
	spawn_cell = Vector2i(cols / 2, 0)
	exit_cell = Vector2i(cols / 2, rows - 1)
	var n := cols * rows
	blocked.resize(n)
	blocked.fill(0)
	_alloc_fields(n)


func _alloc_fields(n: int) -> void:
	ground_dist.resize(n)
	air_dist.resize(n)
	ground_next_x.resize(n)
	ground_next_y.resize(n)
	air_next_x.resize(n)
	air_next_y.resize(n)


func idx(cell: Vector2i) -> int:
	return int(cell.y * cols + cell.x)


func in_bounds(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < cols and cell.y < rows


func is_blocked(cell: Vector2i) -> bool:
	if not in_bounds(cell):
		return true
	return blocked[idx(cell)] != 0


func is_buildable(cell: Vector2i) -> bool:
	if not in_bounds(cell):
		return false
	if cell == spawn_cell or cell == exit_cell:
		return false
	return not is_blocked(cell)


func set_blocked(cell: Vector2i, value: bool) -> void:
	if not in_bounds(cell):
		return
	blocked[idx(cell)] = 1 if value else 0


func grow_south(extra_rows: int) -> void:
	if extra_rows <= 0:
		return
	var old_rows := rows
	var old_blocked := blocked.duplicate()
	rows += extra_rows
	var n := cols * rows
	blocked.resize(n)
	blocked.fill(0)
	for y in old_rows:
		for x in cols:
			blocked[y * cols + x] = old_blocked[y * cols + x]
	exit_cell = Vector2i(cols / 2, rows - 1)
	_alloc_fields(n)


func export_blocked() -> PackedByteArray:
	return blocked.duplicate()


func has_ground_path() -> bool:
	recompute_fields()
	return ground_dist[idx(spawn_cell)] < INF


func recompute_fields() -> void:
	_bfs_distance(false, ground_dist, ground_next_x, ground_next_y)
	_bfs_distance(true, air_dist, air_next_x, air_next_y)


## Multi-source BFS from exit. Builds distance + greedy next-step toward lower distance.
func _bfs_distance(flying: bool, dist: PackedInt32Array, nx: PackedInt32Array, ny: PackedInt32Array) -> void:
	var n := cols * rows
	dist.fill(INF)
	for i in n:
		nx[i] = 0
		ny[i] = 0
	var q: Array[Vector2i] = []
	dist[idx(exit_cell)] = 0
	q.append(exit_cell)
	var head := 0
	while head < q.size():
		var c: Vector2i = q[head]
		head += 1
		var cd: int = dist[idx(c)]
		for d in DIRS:
			var ncell: Vector2i = c + d
			if not in_bounds(ncell):
				continue
			if not flying and is_blocked(ncell):
				continue
			var ni := idx(ncell)
			if dist[ni] <= cd + 1:
				continue
			dist[ni] = cd + 1
			q.append(ncell)
	# Next step: among neighbors, pick lowest distance (deterministic DIR order).
	for y in rows:
		for x in cols:
			var cell := Vector2i(x, y)
			var i := idx(cell)
			if dist[i] >= INF or cell == exit_cell:
				nx[i] = cell.x
				ny[i] = cell.y
				continue
			var best := cell
			var best_d := dist[i]
			for d in DIRS:
				var ncell: Vector2i = cell + d
				if not in_bounds(ncell):
					continue
				if not flying and is_blocked(ncell):
					continue
				var nd: int = dist[idx(ncell)]
				if nd < best_d:
					best_d = nd
					best = ncell
			nx[i] = best.x
			ny[i] = best.y


func next_ground_step(cell: Vector2i) -> Vector2i:
	if not in_bounds(cell):
		return cell
	var i := idx(cell)
	return Vector2i(ground_next_x[i], ground_next_y[i])


func next_air_step(cell: Vector2i) -> Vector2i:
	if not in_bounds(cell):
		return cell
	var i := idx(cell)
	return Vector2i(air_next_x[i], air_next_y[i])


func ground_distance(cell: Vector2i) -> int:
	if not in_bounds(cell):
		return INF
	return ground_dist[idx(cell)]
