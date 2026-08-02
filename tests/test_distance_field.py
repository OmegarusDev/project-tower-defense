#!/usr/bin/env python3
"""Mirror of GridMap distance-field logic — runnable without Godot."""

from __future__ import annotations

INF = 1_000_000
DIRS = [(0, 1), (1, 0), (0, -1), (-1, 0)]


class Grid:
    def __init__(self, cols: int, rows: int):
        self.cols = cols
        self.rows = rows
        self.spawn = (cols // 2, 0)
        self.exit = (cols // 2, rows - 1)
        self.blocked = [[False] * cols for _ in range(rows)]
        self.gdist = [[INF] * cols for _ in range(rows)]
        self.gnext = [[(x, y) for x in range(cols)] for y in range(rows)]
        self.adist = [[INF] * cols for _ in range(rows)]
        self.anext = [[(x, y) for x in range(cols)] for y in range(rows)]

    def in_bounds(self, x, y):
        return 0 <= x < self.cols and 0 <= y < self.rows

    def recompute(self):
        self._bfs(False, self.gdist, self.gnext)
        self._bfs(True, self.adist, self.anext)

    def _bfs(self, flying, dist, nxt):
        for y in range(self.rows):
            for x in range(self.cols):
                dist[y][x] = INF
                nxt[y][x] = (x, y)
        ex, ey = self.exit
        dist[ey][ex] = 0
        q = [(ex, ey)]
        head = 0
        while head < len(q):
            x, y = q[head]
            head += 1
            cd = dist[y][x]
            for dx, dy in DIRS:
                nx, ny = x + dx, y + dy
                if not self.in_bounds(nx, ny):
                    continue
                if not flying and self.blocked[ny][nx]:
                    continue
                if dist[ny][nx] <= cd + 1:
                    continue
                dist[ny][nx] = cd + 1
                q.append((nx, ny))
        for y in range(self.rows):
            for x in range(self.cols):
                if dist[y][x] >= INF or (x, y) == self.exit:
                    continue
                best = (x, y)
                best_d = dist[y][x]
                for dx, dy in DIRS:
                    nx, ny = x + dx, y + dy
                    if not self.in_bounds(nx, ny):
                        continue
                    if not flying and self.blocked[ny][nx]:
                        continue
                    if dist[ny][nx] < best_d:
                        best_d = dist[ny][nx]
                        best = (nx, ny)
                nxt[y][x] = best

    def has_ground(self):
        sx, sy = self.spawn
        return self.gdist[sy][sx] < INF


def test_empty_path():
    g = Grid(7, 9)
    g.recompute()
    assert g.has_ground()
    x, y = g.spawn
    for _ in range(64):
        if (x, y) == g.exit:
            break
        x, y = g.gnext[y][x]
    assert (x, y) == g.exit


def test_air_over_seal():
    g = Grid(5, 6)
    for x in range(g.cols):
        g.blocked[2][x] = True
    g.recompute()
    assert not g.has_ground()
    sx, sy = g.spawn
    assert g.adist[sy][sx] < INF


def test_grow_south_exit_moves():
    g = Grid(5, 6)
    old_exit = g.exit
    # emulate grow
    extra = 2
    g.rows += extra
    g.blocked.extend([[False] * g.cols for _ in range(extra)])
    g.exit = (g.cols // 2, g.rows - 1)
    g.gdist = [[INF] * g.cols for _ in range(g.rows)]
    g.gnext = [[(x, y) for x in range(g.cols)] for y in range(g.rows)]
    g.adist = [[INF] * g.cols for _ in range(g.rows)]
    g.anext = [[(x, y) for x in range(g.cols)] for y in range(g.rows)]
    g.recompute()
    assert g.exit[1] == old_exit[1] + extra
    assert g.has_ground()


if __name__ == "__main__":
    test_empty_path()
    test_air_over_seal()
    test_grow_south_exit_moves()
    print("ALL PYTHON DISTANCE-FIELD TESTS PASSED")
