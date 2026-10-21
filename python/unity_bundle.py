#!/usr/bin/env python3
"""Bounded UnityFS 6..8 extraction; exact member bytes, no asset deserialization."""
import argparse,hashlib,json,lzma,re,struct,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent/'skills/unity-game-reconstruction/scripts'))
from package_safety import StableInput
from extract_container_leaves import normalize_member
MAX_BUNDLE=512*1024*1024

def read(h,n):
    b=h.read(n)
    if len(b)!=n:raise ValueError('truncated UnityFS')
    return b

def cstring(h):
    b=bytearray()
    for _ in range(4096):
        c=read(h,1)
        if c==b'\0':return b.decode('utf8')
        b.extend(c)
    raise ValueError('UnityFS string exceeds budget')

def decompress(data,size,flags):
    kind=flags&63
    if kind==0:out=data
    elif kind in (2,3):
        from importlib.metadata import version
        if version('UnityPy')!='1.25.4':raise ValueError('UnityPy 1.25.4 codec environment required')
        from lz4.block import decompress as lz4
        out=lz4(data,uncompressed_size=size)
    elif kind==1:
        if len(data)<5:raise ValueError('truncated LZMA properties')
        props,dictionary=struct.unpack('<BI',data[:5]);lc=props%9;rest=props//9;pb=rest//5;lp=rest%5
        if dictionary>64*1024*1024 or pb>4:raise ValueError('LZMA dictionary exceeds budget')
        d=lzma.LZMADecompressor(format=lzma.FORMAT_RAW,filters=[{'id':lzma.FILTER_LZMA1,'dict_size':dictionary,'lc':lc,'lp':lp,'pb':pb}])
        out=d.decompress(data[5:],max_length=size+1)
    else:raise ValueError('unsupported/encrypted UnityFS compression')
    if len(out)!=size:raise ValueError('UnityFS block size mismatch')
    return out

def inventory(h,length):
    if length>MAX_BUNDLE or cstring(h)!='UnityFS':raise ValueError('Expected UnityFS <=512 MiB')
    fmt=struct.unpack('>I',read(h,4))[0]
    if fmt not in (6,7,8):raise ValueError('Unsupported UnityFS format')
    player,engine=cstring(h),cstring(h);size,compressed,uncompressed,flags=struct.unpack('>qIII',read(h,20))
    parsed=re.match(r'(\d+)\.(\d+)\.(\d+)',engine)
    if not parsed:raise ValueError('Unknown UnityFS engine version')
    version=tuple(map(int,parsed.groups()));old=version<(2020,3,34) if version[0]==2020 else version<(2021,3,2) if version[0]==2021 else version<(2022,1,1) if version[0]==2022 else version[0]<2020
    if flags & (0x200 if old else 0x1400) or flags & ~0x3ff:raise ValueError('Encrypted or unknown UnityFS flags are unsupported')
    if size!=length or compressed<=0 or uncompressed<=0 or max(compressed,uncompressed)>16*1024*1024 or uncompressed>compressed*200:raise ValueError('UnityFS metadata budget or size mismatch')
    if fmt>=7 or ((2019,4,15)<=version<(2020,0,0)):h.seek((h.tell()+15)//16*16)
    start=h.tell();info_offset=length-compressed if flags&0x80 else start
    if info_offset<start or info_offset+compressed>length:raise ValueError('Invalid UnityFS metadata offset')
    h.seek(info_offset);info=decompress(read(h,compressed),uncompressed,flags)
    from io import BytesIO
    r=BytesIO(info);read(r,16);count=struct.unpack('>i',read(r,4))[0]
    if not 0<count<=10000:raise ValueError('UnityFS block count budget exceeded')
    blocks=[];total=0;compressed_total=0
    for _ in range(count):
        u,c,f=struct.unpack('>IIH',read(r,10));total+=u;compressed_total+=c
        if u>32*1024*1024 or c>32*1024*1024 or u>max(c,1)*512 or total>MAX_BUNDLE or f&63 not in (0,1,2,3) or f&~0x7f:raise ValueError('UnityFS decompression budget/flags exceeded')
        blocks.append((u,c,f))
    count=struct.unpack('>i',read(r,4))[0]
    if not 0<count<=10000:raise ValueError('UnityFS member count budget exceeded')
    nodes=[];names=set();export_bytes=0
    for _ in range(count):
        off,n,f=struct.unpack('>qqI',read(r,20));path=normalize_member(cstring(r));key=path.casefold();export_bytes+=n
        if n<0 or off<0 or off+n>total or export_bytes>MAX_BUNDLE or key in names:raise ValueError('Invalid or duplicate UnityFS member')
        names.add(key);nodes.append({'path':path,'offset':off,'size':n,'flags':f})
    for key in names:
        if any('/'.join(key.split('/')[:i]) in names for i in range(1,len(key.split('/')))):raise ValueError('UnityFS member file/directory collision')
    data_offset=start if flags&0x80 else start+compressed
    if not old and flags&0x200:data_offset=(data_offset+15)//16*16
    data_end=info_offset if flags&0x80 else length
    if data_offset+compressed_total>data_end:raise ValueError('UnityFS data overlaps metadata or exceeds input')
    return {'format':fmt,'engine':engine,'player':player,'data_offset':data_offset,'blocks':blocks,'nodes':nodes,'uncompressed_bytes':total}

def extract(source,destination):
    stable=StableInput.open(source)
    try:
        inv=inventory(stable.handle,stable.size)
        destination.mkdir();marker=destination/'.incomplete';marker.write_text('UnityFS extraction in progress\n')
        records=[]
        with tempfile.TemporaryFile() as raw:
            stable.handle.seek(inv['data_offset'])
            for u,c,f in inv['blocks']:raw.write(decompress(read(stable.handle,c),u,f))
            for node in inv['nodes']:
                out=destination/node['path'];out.parent.mkdir(parents=True,exist_ok=True);raw.seek(node['offset']);remaining=node['size'];digest=hashlib.sha256()
                with out.open('xb') as writer:
                    while remaining:
                        block=read(raw,min(remaining,1024*1024));writer.write(block);digest.update(block);remaining-=len(block)
                out.chmod(0o400);records.append({**node,'sha256':digest.hexdigest()})
        stable.verify_unchanged();marker.unlink()
        return {'status':'complete','source_sha256':stable.sha256,'engine':inv['engine'],'format':inv['format'],'uncompressed_bytes':inv['uncompressed_bytes'],'members':records,'does_not_prove':['decoded object fields','resource reachability','runtime selection']}
    finally:stable.close()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    try:print(json.dumps(extract(a.input,a.output)))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(2)
