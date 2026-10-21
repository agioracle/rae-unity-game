#!/usr/bin/env python3
"""Trace only explicitly admitted SerializedFiles. Never dereference external paths."""
import argparse,hashlib,json,sys
from pathlib import Path
from collections import deque
from importlib.metadata import version
from unity_objects import load_serialized,StableInput,input_budget_bytes

def pointers(value,path='',depth=0,budget=None):
    if budget is None:budget=[0]
    budget[0]+=1
    if depth>128 or budget[0]>100000:raise ValueError('typed reference traversal exceeds depth/value budget')
    if isinstance(value,dict):
        if isinstance(value.get('m_FileID'),int) and isinstance(value.get('m_PathID'),int):
            yield path,value['m_FileID'],value['m_PathID'];return
        for k,v in value.items():yield from pointers(v,path+'/'+str(k).replace('~','~0').replace('/','~1'),depth+1,budget)
    elif isinstance(value,(list,tuple)):
        for i,v in enumerate(value):yield from pointers(v,path+'/'+str(i),depth+1,budget)

def trace(files,start,path_id,max_depth,max_nodes):
    nodes=[];edges=[];queue=deque([(start,int(path_id),0)]);seen=set();partial=False;truncated=False;nulls=0
    names={}
    for path,entry in files.items():names.setdefault(Path(path).name.lower(),[]).append(path)
    while queue:
        path,pid,depth=queue.popleft();key=(path,pid)
        if key in seen:continue
        if len(seen)>=max_nodes:truncated=True;break
        seen.add(key);entry=files[path];obj=entry['file'].objects.get(pid)
        if obj is None:raise ValueError('requested root object is absent')
        node={'path':path,'sha256':entry['sha256'],'pathId':str(pid),'type':obj.type.name,'depth':depth};nodes.append(node)
        try:tree=obj.parse_as_dict();refs=list(pointers(tree));node['name']=tree.get('m_Name');node['decode_status']='complete'
        except Exception as error:node['decode_status']='partial';node['decode_error']=str(error)[:1024];partial=True;continue
        for field,file_id,target_id in refs:
            if target_id==0:nulls+=1;continue
            if len(edges)>=2000:truncated=True;break
            edge={'source':{'path':path,'pathId':str(pid)},'field':field,'file_id':file_id,'path_id':str(target_id)}
            dest=None
            if file_id==0:dest=path
            elif 0<file_id<=len(entry['file'].externals):
                external=entry['file'].externals[file_id-1];external_path=external.path.replace('\\','/');edge['external_path']=external_path;edge['external_guid']=external.guid.hex()
                candidates=names.get(external_path.rsplit('/',1)[-1].lower(),[])
                if len(candidates)==1:dest=candidates[0];edge['resolution']='unique_admitted_basename'
                elif len(candidates)>1:edge['status']='ambiguous_external'
                else:edge['status']='external_not_admitted'
            else:edge['status']='invalid_file_id'
            if dest is not None:
                edge['target']={'path':dest,'sha256':files[dest]['sha256'],'pathId':str(target_id)}
                if target_id not in files[dest]['file'].objects:edge['status']='missing_object'
                else:
                    edge['status']='resolved'
                    if (dest,target_id) not in seen:
                        if depth>=max_depth:truncated=True
                        else:queue.append((dest,target_id,depth+1))
            if edge['status']!='resolved':partial=True
            edges.append(edge)
        if len(edges)>=2000:
            truncated=truncated or bool(queue)
            break
    return {'status':'partial' if partial or truncated else 'complete','nodes':nodes,'edges':edges,'null_references':nulls,'truncated':truncated,'scope':'Outgoing PPtr-shaped fields in decoded reachable objects; no dynamic Resources/Addressables/string or code references inferred.','does_not_prove':['runtime loading or selection','editable project GUID/fileID identity','missing TypeTree fields','unadmitted bundle dependencies']}

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);args=p.parse_args();m=json.loads(Path(args.manifest).read_text())
    if version('UnityPy')!='1.25.4':raise ValueError('UnityPy 1.25.4 is required')
    files={};total=0;handles=[]
    try:
        for item in m['files']:
            stable=StableInput.open(Path(item['input']));handles.append(stable);total+=stable.size
            if stable.size>input_budget_bytes(m.get("maxInputMiB",64)) or total>256*1024*1024:raise ValueError('SerializedFile set exceeds byte budget')
            if stable.sha256!=item['sha256']:raise ValueError('source hash changed')
            env=load_serialized(stable.handle.read(),Path(item['path']).name,m.get('maxInputMiB',64))
            assets=list(env.files.values())
            if len(assets)!=1:raise ValueError('expected one SerializedFile per admitted path')
            files[item['path']]={'file':assets[0],'sha256':stable.sha256}
        result=trace(files,m['path'],m['pathId'],m['maxDepth'],m['maxNodes'])
        for h in handles:h.verify_unchanged()
        result.update(provider='UnityPy',tool_version=version('UnityPy'))
        print(json.dumps(result,ensure_ascii=True,allow_nan=False))
    finally:
        for h in handles:h.close()
if __name__=='__main__':
    try:main()
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(2)
