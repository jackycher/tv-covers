#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把央视栏目大全（tv.cctv.cn/lm）每个栏目自带的横版封面，转成 360x480 白底竖版，
存到 column/<column_id>.jpg，并更新 data/columns.json 清单。

只处理“仓库里还没有”或“封面地址变了”的栏目，因此每天跑一次就只补齐新增栏目。
"""
import io
import json
import os
import time
import urllib.request

from PIL import Image

W, H = 360, 480
API = "https://zy.api.cntv.cn/lanmu/columnSearch"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COL_DIR = os.path.join(ROOT, "column")
DATA_FILE = os.path.join(ROOT, "data", "columns.json")
REFERER = "https://tv.cctv.cn/lm/index.shtml"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": REFERER})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def all_columns():
    out, page = [], 1
    while page <= 60:
        url = "%s?&fl=&fc=&cid=&p=%d&n=100&serviceId=tvcctv&t=jsonp&cb=cb" % (API, page)
        raw = fetch(url).decode("utf-8", "replace")
        body = raw[raw.find("(") + 1: raw.rfind(")")]
        docs = ((json.loads(body).get("response") or {}).get("docs") or [])
        if not docs:
            break
        out.extend(docs)
        page += 1
    return out


def portrait(raw):
    """原图等比缩放后居中放在 360x480 纯白画布上：整张海报完整可见，不裁不拉伸。"""
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    if img.width < 1 or img.height < 1:
        raise ValueError("空图")
    scale = min((W - 16) / img.width, (H - 16) / img.height, 999)
    nw, nh = max(1, int(round(img.width * scale))), max(1, int(round(img.height * scale)))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(img, ((W - nw) // 2, (H - nh) // 2), img)
    return canvas


def main():
    os.makedirs(COL_DIR, exist_ok=True)
    manifest = {}
    if os.path.exists(DATA_FILE):
        try:
            manifest = json.load(open(DATA_FILE, encoding="utf-8"))
        except Exception:
            manifest = {}

    added = failed = 0
    cols = all_columns()
    for row in cols:
        cid = str(row.get("column_id") or "").strip()
        if not cid:
            continue
        name = str(row.get("column_name") or "").strip()
        logo = str(row.get("column_logo") or "").strip()
        path = os.path.join(COL_DIR, cid + ".jpg")
        old = manifest.get(cid) or {}
        same = old.get("logo") == logo and os.path.exists(path) and os.path.getsize(path) > 0
        if same:
            continue
        if not logo:
            manifest[cid] = {"name": name, "logo": "", "cover": False}
            continue
        try:
            img = portrait(fetch(logo))
            img.save(path, "JPEG", quality=86, optimize=True)
            manifest[cid] = {"name": name, "logo": logo, "cover": True}
            added += 1
        except Exception as e:  # 单张失败不影响其余
            print("跳过 %s %s: %s" % (cid, name, e))
            failed += 1
            if os.path.exists(path):
                manifest[cid] = {"name": name, "logo": logo, "cover": True}
        time.sleep(0.05)

    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=0, sort_keys=True)
        f.write("\n")
    print("栏目 %d 个，本次新增/重转 %d 张，失败 %d 张" % (len(cols), added, failed))


if __name__ == "__main__":
    main()
