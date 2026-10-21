#!/usr/bin/env python3
"""Decode an exact component with an attributed, bounded external TypeTree."""
import argparse,hashlib,io,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent/'skills/unity-game-reconstruction/scripts'))
from package_safety import StableInput

def validate_nodes(nodes):
 if not isinstance(nodes,list) or not 1<=len(nodes)<=4096:raise ValueError('Schema node budget exceeded')
 last=-1
 for n in nodes:
  level=n.get('m_Level')
  if type(level)!=int or not 0<=level<=128 or level>last+1 or (last<0 and level!=0):raise ValueError('Invalid schema level')
  for key in ['m_Name','m_Type']:
   if not isinstance(n.get(key),str) or len(n[key])>4096 or '\0' in n[key]:raise ValueError('Schema string budget exceeded')
  if type(n.get('m_MetaFlag',0))!=int or not 0<=n.get('m_MetaFlag',0)<=0xffffffff:raise ValueError('Invalid schema flags')
  last=level
 return nodes

def decode(path,path_id,script_path,script_id,schema_path,max_input_mib=64):
 from unity_objects import input_budget_bytes,load_serialized
 limit=input_budget_bytes(max_input_mib)
 import UnityPy
 from unity_decode_budget import install
 from UnityPy.helpers.TypeTreeNode import TypeTreeNode
 from UnityPy.helpers.Tpk import get_typetree_node
 from UnityPy.helpers.UnityVersion import UnityVersion
 install();opened=[]
 try:
  sources=[];envs=[]
  for p in [path,script_path,schema_path]:
   st=StableInput.open(Path(p));opened.append(st)
   if st.size>(1024*1024 if p==schema_path else limit):raise ValueError('Component source budget exceeded')
   sources.append({'path':p,'sha256':st.sha256})
  schema=json.load(opened[2].handle);nodes=validate_nodes(schema['nodes']);env=load_serialized(opened[0].handle.read(),Path(path).name,max_input_mib);senv=load_serialized(opened[1].handle.read(),Path(script_path).name,max_input_mib)
  objects=[o for o in env.objects if str(o.path_id)==path_id];scripts=[o for o in senv.objects if str(o.path_id)==script_id]
  if len(objects)!=1 or len(scripts)!=1 or objects[0].type.name!='MonoBehaviour' or scripts[0].type.name!='MonoScript':raise ValueError('Exact component/MonoScript identity unavailable')
  obj=objects[0];head=obj.parse_monobehaviour_head();script=scripts[0].read_typetree();ref=head.m_Script
  if ref.m_PathID!=int(script_id):raise ValueError('Component script PathID mismatch')
  if ref.m_FileID==0:
   if Path(path)!=Path(script_path):raise ValueError('Local script reference must use the same SerializedFile')
  else:
   externals=obj.assets_file.externals
   if not 1<=ref.m_FileID<=len(externals) or Path(externals[ref.m_FileID-1].path).name.casefold()!=Path(script_path).name.casefold():raise ValueError('Script external table does not select the admitted file')
  full=(script.get('m_Namespace')+'.' if script.get('m_Namespace') else '')+script['m_ClassName'];assembly=script['m_AssemblyName'].removesuffix('.dll')
  if full!=schema['type'] or assembly!=schema['assembly'].removesuffix('.dll') or obj.assets_file.unity_version!=schema['unity_version']:raise ValueError('Schema class/assembly/Unity version does not match source')
  node=TypeTreeNode.from_list(nodes);header=get_typetree_node(114,UnityVersion.from_str(schema['unity_version'])).m_Children
  if [n.m_Name for n in node.m_Children[:len(header)]]!=[n.m_Name for n in header]:raise ValueError('Generated MonoBehaviour header is incompatible')
  node.m_Children=list(header)+node.m_Children[len(header):];fields=obj.read_typetree(nodes=node,check_read=True)
  if fields['m_Script']!={'m_FileID':ref.m_FileID,'m_PathID':ref.m_PathID}:raise ValueError('Decoded header differs from independent native header')
  for st in opened:st.verify_unchanged()
  return {'sources':sources,'path_id':path_id,'script_path_id':script_id,'assembly':assembly,'type':full,'unity_version':schema['unity_version'],'raw_sha256':hashlib.sha256(obj.get_raw_data()).hexdigest(),'fields':fields,'schema_producer':schema.get('producer'),'limits':['Typed values are derived using the attributed external schema, not embedded original TypeTrees','Header and full-byte consumption are checked; schema-to-metadata semantics remain provider-attributed','No runtime asset selection or complete dependency closure assertion']}
 finally:
  for st in opened:st.close()
if __name__=='__main__':
 p=argparse.ArgumentParser()
 for name in ['path','path-id','script-path','script-id','schema']:p.add_argument('--'+name,required=True)
 p.add_argument('--max-input-mib',type=int,default=64)
 a=p.parse_args();print(json.dumps(decode(a.path,a.path_id,a.script_path,a.script_id,a.schema,a.max_input_mib),allow_nan=False))
