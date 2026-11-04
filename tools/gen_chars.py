"""Auto-generate 4-direction x 4-frame walk sheets (20x32) from a single front-view pixel sprite.

Front : source art, body bob + alternating lifted foot zone.
Back  : mirrored front, head recoloured as hair.
Side  : head with face pushed forward and back of head as hair, body squeezed,
        one swinging arm, legs sheared into a stride.  Right = mirror of left.
"""
import sys, json, os
import numpy as np
from PIL import Image

FW, FH, BASE = 20, 32, 30
CELL = 27
ORDER = ['down', 'left', 'right', 'up']
CYCLE = [0, 1, 0, -1]


def load_grid(path):
    a = np.array(Image.open(path).convert('RGBA'))
    g = a[CELL // 2::CELL, CELL // 2::CELL].copy()
    g[g[:, :, 3] < 128] = 0
    ys, xs = np.where(g[:, :, 3] > 0)
    return g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def lum(p):
    return 0.299 * p[..., 0] + 0.587 * p[..., 1] + 0.114 * p[..., 2]


def is_skin(p):
    r, g, b = p[..., 0].astype(int), p[..., 1].astype(int), p[..., 2].astype(int)
    return (p[..., 3] > 0) & (r >= 225) & (g >= 185) & (b >= 170) & (r - b >= 12) & (r - b <= 70)


def analyse(g):
    h, w = g.shape[:2]
    op = g[:, :, 3] > 0
    sk = is_skin(g)
    # head bottom: last row (in upper half) that still has a wide run of skin
    face_rows = [r for r in range(min(h, 16)) if sk[r].sum() >= 4]
    hb = max(face_rows)
    ft = min(face_rows)
    # hair colours from top rows
    top = g[:5][op[:5]]   # rows 0-4: hair for most people, skin for a shaved head
    cols, cnt = np.unique(top[:, :3], axis=0, return_counts=True)
    order = np.argsort(-cnt)
    hair_mid = cols[order[0]]
    hair_dark = min(cols, key=lambda c: lum(c[None])[0])
    # feet zone
    K = 5
    zt = h - K
    cx = w / 2
    return dict(h=h, w=w, op=op, sk=sk, hb=hb, ft=ft, hair_mid=hair_mid, hair_dark=hair_dark, zt=zt, cx=cx)


def blank():
    return np.zeros((FH, FW, 4), np.uint8)


def paste(dst, src, x0, y0, mask=None):
    h, w = src.shape[:2]
    for r in range(h):
        for c in range(w):
            if src[r, c, 3] and (mask is None or mask[r, c]):
                y, x = y0 + r, x0 + c
                if 0 <= y < FH and 0 <= x < FW:
                    dst[y, x] = src[r, c]


def walk_compose(g, info, step, xoff):
    """body bob + one foot lifted. step 0 stand, +1 lift screen-left foot, -1 lift screen-right."""
    h, w = g.shape[:2]
    Y = BASE - (h - 1)
    out = blank()
    if step == 0:
        paste(out, g, xoff, Y)
        return out
    zt = info['zt']
    cx = int(round(info['cx']))
    colmask = np.zeros((h, w), bool)
    if step == 1:
        colmask[:, :cx] = True
    else:
        colmask[:, cx:] = True
    lower = np.zeros((h, w), bool); lower[zt + 1:] = True
    # lifted half (drawn first, may hide behind body)
    paste(out, g, xoff, Y - 2, mask=lower & colmask)
    # body
    upper = np.zeros((h, w), bool); upper[:zt + 1] = True
    paste(out, g, xoff, Y + 1, mask=upper)
    # planted half
    lower2 = np.zeros((h, w), bool); lower2[zt + 2:] = True
    paste(out, g, xoff, Y, mask=lower2 & ~colmask)
    return out


def make_back(g, info):
    b = g[:, ::-1].copy()
    sk = is_skin(b)
    hb = info['hb']
    for r in range(hb + 1):
        for c in range(b.shape[1]):
            if b[r, c, 3] == 0:
                continue
            px = b[r, c]
            is_hair_like = np.array_equal(px[:3], info['hair_mid']) or np.array_equal(px[:3], info['hair_dark'])
            if is_hair_like:
                continue
            saturated = (int(px[:3].max()) - int(px[:3].min())) > 60 and not sk[r, c]
            if saturated:      # keep accessories (ribbons, flowers)
                continue
            b[r, c, :3] = info['hair_dark'] if r == hb else info['hair_mid']
    # simple strands so the back of the head is not flat
    rows = [r for r in range(1, hb - 1)]
    for i, r in enumerate(rows[1:5]):
        c = b.shape[1] // 2 + 2 - i
        if 0 <= c < b.shape[1] and b[r, c, 3] and np.array_equal(b[r, c, :3], info['hair_mid']):
            b[r, c, :3] = info['hair_dark']
    return b


def make_side(g, info, step):
    """facing left"""
    h, w = g.shape[:2]
    hb, ft = info['hb'], info['ft']
    sk = info['sk']
    s = np.zeros_like(g)
    # ---- head
    head = g[:hb + 1].copy()
    hsk = sk[:hb + 1]
    face_cols = np.where(hsk.any(0))[0]
    fl, fr = face_cols.min(), face_cols.max()
    fw = fr - fl + 1
    for r in range(hb + 1):
        for c in range(w):
            if head[r, c, 3] == 0:
                continue
            inside = fl <= c <= fr and r >= ft
            if inside and (hsk[r, c] or lum(head[r, c][None])[0] < 200):
                head[r, c, :3] = info['hair_dark'] if r == hb else info['hair_mid']
    face_cut = fl + int(round(fw * 0.62))
    shift = 2
    for r in range(ft, hb + 1):
        for c in range(fl, face_cut):
            src = g[r, c]
            if src[3] == 0:
                continue
            if not (sk[r, c] or (lum(src[None])[0] < 200 and c < fl + fw / 2)):
                continue
            nc = c - shift
            if 0 <= nc < w:
                head[r, nc] = src
    # nose
    eye_rows = [r for r in range(ft, hb + 1) if any(lum(g[r, c][None])[0] < 140 for c in range(fl, fl + fw // 2) if g[r, c, 3])]
    if eye_rows:
        nr = min(hb, max(eye_rows) + 1)
        nc = fl - shift - 1
        if nc >= 0:
            head[nr, nc] = g[nr, fl + 1] if sk[nr, fl + 1] else head[nr, nc + 1]
    s[:hb + 1] = head
    # ---- body + legs: squeeze to ~60% around centre, drop arms
    body_rows = range(hb + 1, h)
    cx = info['cx']
    for r in body_rows:
        cols = [c for c in range(w) if g[r, c, 3] and not sk[r, c]]
        if not cols:
            continue
        l, rr = min(cols), max(cols)
        width = rr - l + 1
        nw = max(3, int(round(width * 0.62)))
        nl = int(round(cx - nw / 2))
        for i in range(nw):
            srcc = l + int(i * width / nw)
            s[r, nl + i] = g[r, srcc]
    # ---- legs stride (shear the feet zone)
    zt = info['zt']
    if step != 0:
        K = h - zt
        leg = s[zt:].copy()
        s[zt:] = 0
        for i in range(K):
            r = zt + i
            d = int(round((i + 1) * 3 / K))
            cols = [c for c in range(w) if leg[i, c, 3]]
            if not cols:
                continue
            mid = (min(cols) + max(cols) + 1) / 2
            for c in cols:
                if c < mid:
                    nc = c - d
                else:
                    nc = c + d
                if 0 <= nc < w:
                    s[r, nc] = leg[i, c]
    # ---- one arm: sleeve colour then skin
    sleeve_r = hb + 2
    torso_cols = [c for c in range(w) if s[sleeve_r, c, 3]]
    ac = int(round(cx)) - 1
    sleeve = g[sleeve_r, int(round(cx))] if g[sleeve_r, int(round(cx)), 3] else s[sleeve_r, torso_cols[0]] if torso_cols else None
    skin_rows = [r for r in range(hb + 1, h) if sk[r].any()]
    hand_bottom = max(skin_rows) if skin_rows else hb + 7
    skin_c = g[hand_bottom][sk[hand_bottom]][0] if skin_rows else np.array([255, 230, 222, 255], np.uint8)
    arm_len = hand_bottom - (hb + 1)
    for i in range(arm_len + 1):
        r = hb + 1 + i
        sw = int(round(i * 2.5 / max(1, arm_len))) * (-step)  # swing
        col = sleeve if i < 3 and sleeve is not None else skin_c
        for dc in (0, 1):
            c = ac + dc + sw
            if 0 <= c < w:
                s[r, c] = col
                if col is not skin_c:
                    pass
    return s


def build(path):
    g = load_grid(path)
    info = analyse(g)
    h, w = g.shape[:2]
    if w > FW or h > FH - 3:
        raise SystemExit(f'{path}: {w}x{h} too big')
    xoff = (FW - w) // 2
    back = make_back(g, info)
    frames = {
        'down': [walk_compose(g, info, s, xoff) for s in CYCLE],
        'up': [walk_compose(back, info, -s, xoff) for s in CYCLE],
    }
    left = []
    for s in CYCLE:
        side = make_side(g, info, s)
        left.append(walk_compose(side, info, 0, xoff) if s == 0 else walk_compose(side, info, 0, xoff))
    # side bob
    for i, s in enumerate(CYCLE):
        if s:
            f = np.zeros_like(left[i]); f[1:] = left[i][:-1]
            # keep feet on baseline: put bottom rows back
            f[BASE - 1:] = left[i][BASE - 1:]
            left[i] = f
    frames['left'] = left
    frames['right'] = [f[:, ::-1].copy() for f in left]
    return frames, (w, h)


def save(frames, name, outdir):
    os.makedirs(f'{outdir}/frames', exist_ok=True)
    sheet = Image.new('RGBA', (FW * 4, FH * 4), (0, 0, 0, 0))
    for ri, d in enumerate(ORDER):
        for fi, a in enumerate(frames[d]):
            im = Image.fromarray(a, 'RGBA')
            sheet.paste(im, (fi * FW, ri * FH))
            im.save(f'{outdir}/frames/{name}_walk_{d}_{fi}.png')
    sheet.save(f'{outdir}/{name}_walk.png')
    meta = {
        'image': f'{name}_walk.png', 'frameWidth': FW, 'frameHeight': FH, 'columns': 4, 'rows': 4,
        'footPivot': {'x': FW // 2, 'y': BASE + 1},
        'animations': {
            **{f'walk_{d}': {'row': i, 'frames': [i * 4 + f for f in range(4)], 'fps': 8, 'loop': True} for i, d in enumerate(ORDER)},
            **{f'idle_{d}': {'row': i, 'frames': [i * 4], 'fps': 1, 'loop': True} for i, d in enumerate(ORDER)},
        },
    }
    json.dump(meta, open(f'{outdir}/{name}_walk.json', 'w'), indent=2)
    return sheet


if __name__ == '__main__':
    outdir = sys.argv[1]
    for arg in sys.argv[2:]:
        path, name = arg.split('=')
        frames, size = build(path)
        save(frames, name, outdir)
        print(name, size)
