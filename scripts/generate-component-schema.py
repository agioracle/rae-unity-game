#!/usr/bin/env python3
"""Generate an attributed TypeTree from explicitly selected metadata-only DLLs.
Requires trusted optional TypeTreeGeneratorAPI0.0.10. Never executes game DLLs.
"""
import argparse,hashlib,json,re,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'python'))
from component_schema import validate_nodes

def normalize_provider_nodes(nodes):
 # TypeTreeGeneratorAPI0.0.10 emits List<string> with a scalar string label.
 # UnityPy treats that label as terminal and reads the element count as bytes.
 # Match only the complete distinctive collection prefix; keep scalar strings.
 result=[dict(n) for n in nodes];changes=[]
 for i,n in enumerate(nodes):
  if n.get('m_Type')!='string' or i+3>=len(nodes):continue
  a,size,data=nodes[i+1:i+4];level=n['m_Level']
  if (a.get('m_Type'),a.get('m_Name'),a.get('m_Level'),size.get('m_Type'),size.get('m_Name'),size.get('m_Level'),data.get('m_Type'),data.get('m_Name'),data.get('m_Level'))==('Array','Array',level+1,'int','size',level+2,'string','data',level+2):
   result[i]['m_Type']='vector';changes.append({'node':i,'name':n['m_Name'],'from':'string','to':'vector','reason':'Provider string collection container repair; scalar string elements retained'})
 return result,changes

def generate(dll_directory,unity_version,assembly,type_name,binary_sha256,metadata_sha256,output):
 from TypeTreeGeneratorAPI import TypeTreeGenerator,__version__
 if __version__!='0.0.10':raise ValueError('TypeTreeGeneratorAPI0.0.10 required')
 for h in [binary_sha256,metadata_sha256]:
  if not re.fullmatch('[a-f0-9]{64}',h):raise ValueError('Expected source SHA-256')
 directory=Path(dll_directory).absolute();files=sorted(directory.glob('*.dll'))
 if not 1<=len(files)<=128 or any(p.is_symlink() or not p.is_file() or p.stat().st_size>64*1024*1024 for p in files) or sum(p.stat().st_size for p in files)>256*1024*1024:raise ValueError('Schema library budget exceeded')
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files};generator=TypeTreeGenerator(unity_version)
 for p in files:generator.load_dll(p.read_bytes())
 raw_nodes=validate_nodes(json.loads(generator.get_nodes_as_json(assembly if assembly.endswith('.dll') else assembly+'.dll',type_name)))
 nodes,normalizations=normalize_provider_nodes(raw_nodes)
 if any(hashlib.sha256(p.read_bytes()).hexdigest()!=hashes[p.name] for p in files):raise ValueError('Schema libraries changed')
 result={'unity_version':unity_version,'assembly':assembly.removesuffix('.dll'),'type':type_name,'inputs':{'binary_sha256':binary_sha256,'metadata_sha256':metadata_sha256},'producer':{'name':'TypeTreeGeneratorAPI','version':__version__,'libraries':hashes,'raw_nodes_sha256':hashlib.sha256(json.dumps(raw_nodes,sort_keys=True).encode()).hexdigest(),'normalizations':normalizations,'association':'Caller-attributed input association. DLLs are navigation/serialization schema evidence, not original bodies. Native header and full-byte consumption are checked separately by decode-component.'},'nodes':nodes}
 with Path(output).open('x') as f:json.dump(result,f,indent=2)
 return {'output':str(output),'nodes':len(nodes),'sha256':hashlib.sha256(Path(output).read_bytes()).hexdigest()}
if __name__=='__main__':
 p=argparse.ArgumentParser()
 for name in ['dll-directory','unity-version','assembly','type','binary-sha256','metadata-sha256','output']:p.add_argument('--'+name,required=True)
 a=p.parse_args();print(json.dumps(generate(a.dll_directory,a.unity_version,a.assembly,a.type,a.binary_sha256,a.metadata_sha256,a.output)))
