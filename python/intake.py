#!/usr/bin/env python3
"""Bounded local package intake. Supplied bytes are data, never executable code."""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'skills/unity-game-reconstruction/scripts'))
from package_safety import StableInput, preflight_central_directory, validate_zip_members, create_private_output_directory
import inspect_unity_package as inspector
from extract_container_leaves import normalize_member

MAX_FILES = 100000
MAX_BYTES = 32 * 1024**3
MAX_MEMBER = 8 * 1024**3
MAX_NESTED = 64


def regular_files(root: Path):
    """Do not follow symlinks, devices or silently excluded evidence directories."""
    count = total = 0
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs.sort(); files.sort()
        for name in dirs + files:
            p = Path(base) / name
            mode = p.lstat().st_mode
            if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                raise ValueError(f'unsupported evidence symlink or special file: {p}')
        for name in files:
            p = Path(base) / name
            count += 1; total += p.stat().st_size
            if count > MAX_FILES or total > MAX_BYTES:
                raise ValueError('evidence directory exceeds file or byte budget')
            yield p


def snapshot_file(source: Path, target: Path):
    stable = StableInput.open(source)
    try:
        if stable.size > MAX_MEMBER:
            raise ValueError(f'input exceeds file byte budget: {source}')
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as output:
            shutil.copyfileobj(stable.handle, output, 1024*1024)
        stable.verify_unchanged()
        target.chmod(0o400)
        return {'path': str(target), 'source': str(source), 'sha256': stable.sha256, 'size_bytes': stable.size}
    finally:
        stable.close()


def archive_members(stable: StableInput, archive: zipfile.ZipFile):
    infos = archive.infolist()
    validate_zip_members(infos, MAX_FILES, MAX_MEMBER, MAX_BYTES, 200)
    paths = {}
    for info in infos:
        raw = info.filename
        name = normalize_member(raw.rstrip('/'))
        mode = info.external_attr >> 16
        if stat.S_ISLNK(mode) or info.flag_bits & 1:
            raise ValueError(f'unsafe encrypted member or symlink: {raw}')
        if name in paths:
            raise ValueError(f'duplicate normalized archive member: {name}')
        paths[name] = info
    for name, info in paths.items():
        parts = name.split('/')
        for n in range(1, len(parts)):
            parent = '/'.join(parts[:n])
            if parent in paths and not paths[parent].is_dir():
                raise ValueError(f'archive file/directory collision: {name}')
    return paths


def preflight(source: Path):
    stable = StableInput.open(source)
    try:
        preflight_central_directory(stable, 16*1024**3, MAX_FILES, 128*1024**2)
        with zipfile.ZipFile(stable.handle) as archive:
            archive_members(stable, archive)
        stable.verify_unchanged()
    finally:
        stable.close()


def package_sources(source: Path):
    if source.is_file():
        if source.suffix.lower() not in inspector.PACKAGE_SUFFIXES:
            raise ValueError('expected APK/XAPK/APKS/AAB/ZIP/APKM or a Unity player directory')
        return [source]
    files = list(regular_files(source))
    return [p for p in files if p.suffix.lower() in inspector.PACKAGE_SUFFIXES]


def desktop_inventory(source: Path):
    files = list(regular_files(source))
    names = [p.relative_to(source).as_posix() for p in files]
    metadata = [n for n in names if n.lower().endswith('global-metadata.dat')]
    native = [n for n in names if Path(n).name.lower() in ('gameassembly.dll', 'libil2cpp.so', 'gameassembly.so', 'gameassembly.dylib')]
    managed = [n for n in names if '/managed/' in ('/'+n.lower()) and n.lower().endswith('.dll')]
    versions = set()
    for p in files:
        if p.name in inspector.UNITY_VERSION_CANDIDATES and p.stat().st_size <= 8*1024**2:
            versions.update(m.group(1).decode('ascii') for m in inspector.UNITY_VERSION_RE.finditer(p.read_bytes()))
    unity = bool(metadata or native or managed or any(n.endswith('/globalgamemanagers') for n in names))
    rows = []
    for p in files:
        stable = StableInput.open(p)
        try:
            rows.append({'path':p.relative_to(source).as_posix(),'sha256':stable.sha256,'size_bytes':stable.size})
            stable.verify_unchanged()
        finally:stable.close()
    return {'schema_version':1,'status':'complete','target':str(source),'format':'player_directory',
        'backend_assessment':'IL2CPP' if metadata and native else 'Mono_candidate' if managed else 'Unity_backend_unknown' if unity else 'Unity_not_detected',
        'unity_versions_found':sorted(versions),'abis':[], 'container_count':0,'error_count':0,'containers':[],
        'global_metadata':metadata,'native_binaries':native,'managed_assemblies':managed,'files':rows,
        'warnings':['Directory inventory does not verify signing, architecture, method bodies or native/metadata compatibility.']}


def inspect_source(source: Path, output: Path):
    if source.is_symlink() or not source.exists():
        raise ValueError('input must be an existing non-symlink file or directory')
    # A Unity player may ship ZIP content; package scanning must not replace its player inventory.
    player = source.is_dir() and any(p.name.lower() in ('globalgamemanagers','gameassembly.dll','unityplayer.dll','global-metadata.dat') for p in regular_files(source))
    sources = [] if player else package_sources(source)
    if sources:
        for item in sources:preflight(item)
        # The original inspector scans immediate split directories. Inventory nested paths explicitly.
        leaves = []
        for item in sources:
            with contextlib.redirect_stdout(io.StringIO()):
                # Use its public entrypoint per source so all native scanner budgets stay in force.
                temporary = output.parent / ('.inventory-'+str(len(leaves))+'.json')
                code = inspector.main([str(item),'--output',str(temporary),'--max-items','200'])
            report = json.loads(temporary.read_text());temporary.unlink()
            if code != 0: raise ValueError('package inspector rejected input: '+json.dumps(report.get('errors',[])))
            leaves.extend(report['containers'])
        if len(leaves)>256: raise ValueError('too many supplied container leaves')
        report = inspector.aggregate(source, leaves)
    else:
        if not source.is_dir():raise ValueError('no package containers found')
        report=desktop_inventory(source)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return report


def extract_archive(source: Path, target: Path, budget: dict, manifest: list, source_hash: str):
    stable=StableInput.open(source)
    try:
        preflight_central_directory(stable, 16*1024**3, MAX_FILES, 128*1024**2)
        with zipfile.ZipFile(stable.handle) as archive:
            members=archive_members(stable,archive)
            target.mkdir(parents=True,exist_ok=False)
            for name,info in members.items():
                out=target/name
                if info.is_dir():out.mkdir(parents=True,exist_ok=True);continue
                budget['files']+=1;budget['bytes']+=info.file_size
                if budget['files']>MAX_FILES or budget['bytes']>MAX_BYTES:raise ValueError('global extraction budget exceeded')
                out.parent.mkdir(parents=True,exist_ok=True)
                h=hashlib.sha256();written=0
                with archive.open(info) as src, out.open('xb') as dest:
                    while True:
                        chunk=src.read(1024*1024)
                        if not chunk:break
                        written+=len(chunk)
                        if written>info.file_size:raise ValueError('member expanded beyond declared size')
                        h.update(chunk);dest.write(chunk)
                if written!=info.file_size:raise ValueError('member size mismatch')
                out.chmod(0o400)
                manifest.append({'path':str(out),'sha256':h.hexdigest(),'size_bytes':written,'container_sha256':source_hash,'member':name})
        stable.verify_unchanged()
    finally:stable.close()


def initialize(source: Path, workspace: Path):
    if source.is_symlink():raise ValueError('input must not be a symlink')
    # Resolve existing parents for containment; never create a workspace inside its evidence.
    if source.is_dir() and (workspace.resolve()==source.resolve() or source.resolve() in workspace.resolve().parents):
        raise ValueError('workspace must be outside the input evidence directory')
    root=create_private_output_directory(workspace)
    marker=root/'.incomplete';marker.write_text('Intake has not completed. Do not use as evidence-ready.\n')
    for name in ('00_original','01_inventory','02_container_leaves','03_android_raw','04_unity_raw','05_indexes','06_compat'):
        (root/'recovered'/name).mkdir(parents=True)
    for name in ('validation','analysis_tools','project','reports'):(root/name).mkdir()
    original=root/'recovered/00_original'
    rows=[]
    if source.is_dir():
        files=list(regular_files(source))
        for item in files:rows.append(snapshot_file(item,original/'source'/item.relative_to(source)))
        snapshot=original/'source'
        if sorted(p.relative_to(source).as_posix() for p in regular_files(source))!=sorted(p.relative_to(source).as_posix() for p in files):
            raise ValueError('input directory membership changed during snapshot')
    else:
        snapshot=original/source.name;rows.append(snapshot_file(source,snapshot))
    inventory=inspect_source(snapshot,root/'recovered/01_inventory/package.json')
    raw=[];budget={'files':0,'bytes':0}
    if inventory.get('format')!='player_directory':
        sources=package_sources(snapshot)
        nested_count=0
        for index,item in enumerate(sources):
            label=item.name if len(sources)==1 else f'{index:04d}-{item.name}'
            digest=next(r['sha256'] for r in rows if r['path']==str(item))
            rawroot=root/'recovered/03_android_raw'/label
            extract_archive(item,rawroot,budget,raw,digest)
            # Expand one container layer of APKs, each with independent raw scope and provenance.
            nested=[p for p in rawroot.rglob('*') if p.is_file() and p.suffix.lower()=='.apk']
            for leaf in sorted(nested):
                nested_count+=1
                if nested_count>MAX_NESTED:raise ValueError('nested APK count exceeds budget')
                leafcopy=root/'recovered/02_container_leaves'/f'{nested_count:04d}-{leaf.name}'
                record=snapshot_file(leaf,leafcopy)
                raw.append({**record,'container_sha256':digest,'member':leaf.relative_to(rawroot).as_posix()})
                extract_archive(leafcopy,root/'recovered/03_android_raw'/leafcopy.name,budget,raw,record['sha256'])
    manifest={'schema_version':1,'originals':rows,'extracted':raw,'coverage':{'files':budget['files'],'bytes':budget['bytes']},'does_not_prove':['decoded exports','method recovery','gameplay parity','signer or package identity']}
    (root/'recovered/01_inventory/intake-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return {'workspace':str(root),'inventory':inventory,'manifest':manifest}


def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['inspect','init']);p.add_argument('--input',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
    args=p.parse_args()
    try:
        source=Path(os.path.abspath(args.input));output=Path(os.path.abspath(args.output))
        result=initialize(source,output) if args.operation=='init' else {'inventory':inspect_source(source,output)}
        print(json.dumps(result,ensure_ascii=False));return 0
    except (ValueError,OSError,zipfile.BadZipFile,RuntimeError) as e:
        print(json.dumps({'error':str(e),'incomplete_workspace':str(args.output) if args.operation=='init' else None}),file=sys.stderr);return 2

if __name__=='__main__':sys.exit(main())
