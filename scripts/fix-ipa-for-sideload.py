#!/usr/bin/env python3
"""Repair an unsigned iOS IPA for sideloading with Sideloadly.

Xcode 产出的 appex（PlugIns/*.appex）Info.plist 常为二进制格式，且缺失
CFBundleExecutable / CFBundleName / CFBundleInfoDictionaryVersion /
CFBundlePackageType / CFBundleSignature 等标准键，导致：
  - Sideloadly 0.60 无法解析 appex 可执行文件名（"could not find
    executable for ...%%1"）；
  - iOS installd 因缺 CFBundleName 拒绝安装。

本脚本：
  1. 解压 IPA；
  2. 把每个 PlugIns/*.appex/Info.plist 重写为 XML，并补全缺失标准键
     （键值从 appex 目录名推导）；
  3. 同时把主 App 的 Info.plist 转成 XML；
  4. 重新打包为 IPA（Payload/ 位于归档根目录，路径用正斜杠）。

幂等：对已修复的 IPA 重复运行安全。

用法：
  python3 scripts/fix-ipa-for-sideload.py <in.ipa> [<out.ipa>]

跨平台（macOS / Windows），仅依赖 Python 3.8+ 标准库。

与 scripts/package-ios-unsigned.sh 的关系：sh 已在打包时内联完成同样的
处理（PlistBuddy + plutil，仅限 macOS）；本脚本用于在任意平台上事后
处理已产出的 IPA。
"""

import os
import plistlib
import shutil
import sys
import tempfile
import zipfile

# appex 缺失时必须补全的标准键（存在则保留原值）
REQUIRED_APPEX_KEYS = {
    "CFBundleInfoDictionaryVersion": "6.0",
    "CFBundlePackageType": "XPC!",
    "CFBundleSignature": "????",
}


def extract_ipa(src, dest):
    """解压 IPA，逐条写入 dest，防御路径穿越。"""
    with zipfile.ZipFile(src) as zin:
        for info in zin.infolist():
            name = info.filename.replace("/", os.sep)
            if ".." in name.split(os.sep):
                raise ValueError("unsafe path in IPA: %r" % info.filename)
            target = os.path.join(dest, name)
            if info.is_dir() or name.endswith(os.sep):
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zin.open(info) as fsrc, open(target, "wb") as fdst:
                shutil.copyfileobj(fsrc, fdst)


def repackage_ipa(src_dir, out_ipa):
    """把 src_dir 内容打包为 IPA，统一正斜杠、Payload 在根目录。"""
    count = 0
    with zipfile.ZipFile(out_ipa, "w", zipfile.ZIP_DEFLATED) as zout:
        for root, _dirs, files in os.walk(src_dir):
            for f in files:
                full = os.path.join(root, f)
                arc = os.path.relpath(full, src_dir).replace(os.sep, "/")
                zout.write(full, arc)
                count += 1
    return count


def normalize_plist(path, ensure_exec_name=None):
    """读 plist（二进制/XML 均可），以 XML 写回；可选补全 appex 标准键。"""
    with open(path, "rb") as f:
        data = plistlib.load(f)
    if ensure_exec_name:
        data.setdefault("CFBundleExecutable", ensure_exec_name)
        data.setdefault("CFBundleName", ensure_exec_name)
        for key, value in REQUIRED_APPEX_KEYS.items():
            data.setdefault(key, value)
    with open(path, "wb") as f:
        plistlib.dump(data, f, fmt=plistlib.FMT_XML, sort_keys=False)
    return data


def fix_app_bundle(app_dir):
    """修复主 App Info.plist 及其全部 appex。返回 {appex名: 可执行名}。"""
    main_plist = os.path.join(app_dir, "Info.plist")
    if os.path.isfile(main_plist):
        normalize_plist(main_plist)
    reported = {}
    plug_ins = os.path.join(app_dir, "PlugIns")
    if not os.path.isdir(plug_ins):
        return reported
    for appex in sorted(os.listdir(plug_ins)):
        if not appex.endswith(".appex"):
            continue
        plist_path = os.path.join(plug_ins, appex, "Info.plist")
        if not os.path.isfile(plist_path):
            continue
        exec_name = appex[: -len(".appex")]
        normalize_plist(plist_path, ensure_exec_name=exec_name)
        reported[appex] = exec_name
    return reported


def main(argv):
    if len(argv) not in (1, 2):
        print(__doc__)
        return 2
    in_ipa = os.path.abspath(argv[0])
    out_ipa = os.path.abspath(argv[1]) if len(argv) == 2 else in_ipa
    if not os.path.isfile(in_ipa):
        print("error: input IPA not found: %s" % in_ipa, file=sys.stderr)
        return 1

    tmp = tempfile.mkdtemp(prefix="fix-ipa-")
    try:
        extract_ipa(in_ipa, tmp)
        payload = os.path.join(tmp, "Payload")
        if not os.path.isdir(payload):
            print("error: no Payload/ directory in IPA", file=sys.stderr)
            return 1
        fixed = {}
        for name in sorted(os.listdir(payload)):
            if name.endswith(".app"):
                fixed.update(fix_app_bundle(os.path.join(payload, name)))
        if not fixed:
            print("note: no .appex found; only normalized main Info.plist(s)")
        # 先写临时输出再原子替换，兼容 out == in 的场景
        fd, tmp_out = tempfile.mkstemp(
            dir=os.path.dirname(out_ipa) or ".", prefix=os.path.basename(out_ipa) + "."
        )
        os.close(fd)
        try:
            count = repackage_ipa(tmp, tmp_out)
        except BaseException:
            os.unlink(tmp_out)
            raise
        os.replace(tmp_out, out_ipa)
        for appex, exec_name in sorted(fixed.items()):
            print("  fixed %s: CFBundleExecutable/CFBundleName = %s, XML"
                  % (appex, exec_name))
        print("ok: %d entries written to %s" % (count, out_ipa))
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
