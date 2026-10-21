#!/usr/bin/env python3
"""Game-independent, bounded ARM/Thumb/ARM64 navigation windows. Never execute input code."""
import argparse,bisect,hashlib,json,struct,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent/'skills/unity-game-reconstruction/scripts'))
from package_safety import StableInput

def elf_format(data):
 if len(data)<52 or data[:4]!=b'\x7fELF' or data[5:7]!=b'\x01\x01':raise ValueError('Only little-endian ARM/ARM64 ELF is supported')
 bits=data[4];machine=struct.unpack_from('<H',data,18)[0]
 if (bits,machine) not in [(1,40),(2,183)]:raise ValueError('Only ARM ELF32 or ARM64 ELF64 is supported')
 if bits==2 and len(data)<64:raise ValueError('Truncated ELF64 header')
 return bits,machine

def elf_offset(data,va,size):
 bits,_=elf_format(data)
 phoff=struct.unpack_from('<Q' if bits==2 else '<I',data,32 if bits==2 else 28)[0];entry,count=struct.unpack_from('<HH',data,54 if bits==2 else 42)
 if entry!=(56 if bits==2 else 32) or not 0<count<=1024 or phoff+entry*count>len(data):raise ValueError('Invalid ELF program headers')
 offsets=[]
 for i in range(count):
  if bits==2:kind,flags,offset,address,_,file_size,memory_size,_=struct.unpack_from('<IIQQQQQQ',data,phoff+i*entry)
  else:kind,offset,address,_,file_size,memory_size,flags,_=struct.unpack_from('<IIIIIIII',data,phoff+i*entry)
  if kind==1 and flags&1 and address<=va and va+size<=address+file_size and offset+file_size<=len(data) and file_size<=memory_size:offsets.append(offset+va-address)
 if len(offsets)!=1:raise ValueError('Native range is outside one unique executable file-backed segment')
 return offsets[0]

def select_methods(rows,selections):
 if not 1<=len(selections)<=32 or len({(s['assembly'],s['token'].lower()) for s in selections})!=len(selections):raise ValueError('Select1..32 unique assembly/token pairs')
 result=[]
 for s in selections:
  found=[m for m in rows if m['assembly']==s['assembly'] and m['token'].lower()==s['token'].lower()]
  if len(found)!=1:raise ValueError('Method selection must resolve to exactly one declaration')
  if not found[0]['has_native_pointer']:raise ValueError('Selected method has no native pointer')
  result.append(found[0])
 return result

def inspect(workspace,report_path,report_sha,selections,max_span):
 from capstone import Cs,CS_ARCH_ARM64,CS_ARCH_ARM,CS_MODE_LITTLE_ENDIAN,CS_MODE_ARM,CS_MODE_THUMB
 import capstone
 if capstone.__version__!='5.0.6':raise ValueError('Capstone5.0.6 required')
 if not 4<=max_span<=16384:raise ValueError('Per-method byte budget must be4..16384')
 root=Path(workspace).resolve();opened=[]
 def stable(path,max_bytes):
  p=Path(path)
  if not p.is_absolute():p=root/p
  if not p.resolve().is_relative_to(root):raise ValueError('Evidence must stay inside workspace')
  if any(q.is_symlink() for q in [p,*p.parents]):raise ValueError('Symlink evidence is unsupported')
  st=StableInput.open(p);opened.append(st)
  if st.size>max_bytes:raise ValueError('Native evidence exceeds byte budget')
  return st
 try:
  report_file=stable(report_path,4*1024*1024)
  if report_file.sha256!=report_sha:raise ValueError('Map report hash changed')
  report=json.load(report_file.handle)
  if len(report['sources'])!=4:raise ValueError('Expected attributed binary/metadata/catalog/provenance sources')
  source_files=[]
  for index,source in enumerate(report['sources']):
   f=stable(source['path'],512*1024*1024 if index==0 else 128*1024*1024)
   if f.sha256!=source['sha256']:raise ValueError('Mapped source hash changed')
   source_files.append(f)
  binary,catalog=source_files[0],source_files[2]
  rows=[]
  if not report['sources'][2]['path'].endswith('.jsonl'):raise ValueError('This native window adapter requires the LibCpp2IL JSONL catalog')
  while True:
   line=catalog.handle.readline(65537)
   if not line:break
   if len(line)>65536 or len(rows)>=200000:raise ValueError('Catalog count/line budget exceeded')
   if line.strip():rows.append(json.loads(line))
  binary.handle.seek(0);data=binary.handle.read();bits,machine=elf_format(data)
  normalize=lambda va: va&~1 if machine==40 else va
  selected=select_methods(rows,selections);aliases={}
  for row in rows:
   if row['has_native_pointer']:aliases.setdefault(normalize(int(row['virtual_address'],16)),[]).append({'assembly':row['assembly'],'token':row['token'],'name':row['full_name']})
  alias_bytes={va:len(json.dumps(items).encode()) for va,items in aliases.items()};output_bytes=4096+len(json.dumps(report['sources']).encode())
  pointers=sorted(aliases);methods=[];total=0
  for method in selected:
   provider_va=int(method['virtual_address'],16);va=normalize(provider_va);thumb=machine==40 and bool(provider_va&1);alignment=2 if thumb else 4;instruction_set='thumb' if thumb else 'arm' if machine==40 else 'arm64';cs=Cs(CS_ARCH_ARM if machine==40 else CS_ARCH_ARM64,(CS_MODE_THUMB if thumb else CS_MODE_ARM) if machine==40 else CS_MODE_LITTLE_ENDIAN);index=bisect.bisect_right(pointers,va)
   if index==len(pointers):raise ValueError('No following native pointer for a bounded navigation window')
   size=pointers[index]-va;total+=size
   if va%alignment or size%alignment or not 0<size<=max_span or total>65536:raise ValueError('Navigation window exceeds alignment/per-method/aggregate budget')
   offset=elf_offset(data,va,size);raw=data[offset:offset+size];instructions=[]
   for i in cs.disasm(raw,va):
    target=int(i.op_str[1:],16) if i.mnemonic in ('b','bl','b.w','blx') and i.op_str.startswith('#0x') else None
    output_bytes+=512+alias_bytes.get(normalize(target) if target is not None else None,2)
    if output_bytes>4*1024*1024:raise ValueError('Native output budget exceeded before alias expansion')
    instructions.append({'address':hex(i.address),'bytes':i.bytes.hex(),'mnemonic':i.mnemonic,'operands':i.op_str,'callee_candidates':aliases.get(normalize(target) if target is not None else None,[])})
   if sum(len(i['bytes'])//2 for i in instructions)!=size:raise ValueError('Native window did not fully decode; may include data or unsupported instructions')
   output_bytes+=1024+alias_bytes[va]+len(json.dumps({k:method[k] for k in ['assembly','token','full_name']}).encode())
   if output_bytes>4*1024*1024:raise ValueError('Native output budget exceeded before alias expansion')
   methods.append({'assembly':method['assembly'],'token':method['token'],'name':method['full_name'],'elf_va':hex(va),'provider_address':hex(provider_va),'instruction_set':instruction_set,'file_offset':hex(offset),'navigation_bytes':size,'range_basis':'next unique catalog pointer; not independently proven body size','code_sha256':hashlib.sha256(raw).hexdigest(),'alias_candidates':aliases[va],'instructions':instructions})
  for f in opened:f.verify_unchanged()
  return {'map_sha256':report_sha,'sources':report['sources'],'provider':'Capstone','version':capstone.__version__,'methods':methods,'limits':['ARM/Thumb ELF32 and ARM64 ELF64 on-disk navigation only','Native windows can contain padding or data; they are not original C# bodies','All callee aliases are preserved; indirect/runtime selection remains unresolved','Semantic interpretation belongs to the host investigator']}
 finally:
  for f in opened:f.close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--workspace',required=True);p.add_argument('--map-report',required=True);p.add_argument('--map-sha256',required=True);p.add_argument('--methods',required=True);p.add_argument('--max-bytes',type=int,default=4096);a=p.parse_args();print(json.dumps(inspect(a.workspace,a.map_report,a.map_sha256,json.loads(a.methods),a.max_bytes)))
