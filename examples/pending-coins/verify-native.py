"""Independent byte-level verification for the bounded real-APK currency example.
Requires optional Capstone 5.0.6; no package is installed by this script.
"""
import argparse,hashlib,json,struct
from pathlib import Path
from capstone import Cs,CS_ARCH_ARM64,CS_MODE_LITTLE_ENDIAN
import capstone

def main():
 p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--map-report',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 report=json.loads(a.map_report.read_text());source=report['sources'][0];binary=(a.workspace/source['path']).read_bytes()
 if hashlib.sha256(binary).hexdigest()!=source['sha256']:raise ValueError('native binary hash mismatch')
 cs=Cs(CS_ARCH_ARM64,CS_MODE_LITTLE_ENDIAN);rows=[]
 # Ranges end at the next unique catalog pointer; these are navigation bounds, not independently recovered method body sizes.
 catalog=next(s for s in report['sources'] if s['path'].endswith('methods.jsonl'));catalog_bytes=(a.workspace/catalog['path']).read_bytes()
 if hashlib.sha256(catalog_bytes).hexdigest()!=catalog['sha256']:raise ValueError('catalog changed')
 all_methods=[json.loads(l) for l in catalog_bytes.splitlines()];by_address={int(m['virtual_address'],16):m['full_name'] for m in all_methods if m['has_native_pointer']}
 pointers=sorted(by_address)
 for m in all_methods:
  if m['assembly']!='Assembly-CSharp' or m['full_name'] not in ['CurrencyManager::GetPendingCoins','CurrencyManager::SetPendingCoins','CurrencyManager::AddPendingCoins','CurrencyManager::ConsumePendingCoins']:continue
  mapped=next(r for r in report['methods'] if r['token']==m['token']);offset=int(mapped['file_offset'],16);va=int(mapped['elf_va'],16);following=next((p for p in pointers if p>va),None)
  if following is None or not 0<following-va<=4096:raise ValueError('no bounded following method pointer')
  size=following-va;raw=binary[offset:offset+size];instructions=list(cs.disasm(raw,int(mapped['elf_va'],16)))
  if sum(i.size for i in instructions)!=size:raise ValueError('incomplete native instruction decode')
  rows.append({'token':m['token'],'name':m['full_name'],'elf_va':mapped['elf_va'],'provider_rva':mapped['provider_reported_rva'],'file_offset':mapped['file_offset'],'size':size,'range_basis':'next unique catalog pointer; navigation window, not independently proven body size','code_sha256':hashlib.sha256(raw).hexdigest(),'instructions':[{'address':hex(i.address),'bytes':i.bytes.hex(),'mnemonic':i.mnemonic,'operands':i.op_str,'callee':by_address.get(int(i.op_str[1:],16)) if i.mnemonic in ('b','bl') and i.op_str.startswith('#0x') else None} for i in instructions]})
 if len(rows)!=4:raise ValueError('expected four native currency procedures')
 result={'source':source,'map_sha256':hashlib.sha256(a.map_report.read_bytes()).hexdigest(),'provider':'Capstone','version':capstone.__version__,'methods':rows,'limits':['Disassembly is not original managed source.','Semantic interpretation is host-authored.','This disassembly does not execute Android runtime or PlayerPrefs.']}
 a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'methods':len(rows),'instructions':sum(len(r['instructions']) for r in rows),'output':str(a.output)}))
if __name__=='__main__':main()
