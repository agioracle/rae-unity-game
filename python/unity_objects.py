#!/usr/bin/env python3
"""Read bounded Unity SerializedFile evidence with a pinned optional parser."""
from __future__ import annotations
import argparse, base64, hashlib, json, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent/'skills/unity-game-reconstruction/scripts'))
from package_safety import StableInput
MAX_INPUT=64*1024*1024


def encode(value):
    if isinstance(value,int) and not isinstance(value,bool) and abs(value)>9007199254740991:return {'$int64':str(value)}
    if isinstance(value,(bytes,bytearray)):
        result={'$bytes_sha256':hashlib.sha256(value).hexdigest(),'length':len(value)}
        if len(value)<=4096:result['base64']=base64.b64encode(value).decode('ascii')
        else:result['omitted']=True
        return result
    if isinstance(value,dict):return {str(k):encode(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [encode(v) for v in value]
    if value is None or isinstance(value,(str,int,float,bool)):return value
    return {'$unsupported_type':type(value).__name__}


def input_budget_bytes(mib):
    if type(mib)!=int or not 1<=mib<=128:raise ValueError("SerializedFile budget must be1..128MiB")
    return mib*1024*1024

def load_serialized(data,name,max_input_mib=64):
    if len(data)>input_budget_bytes(max_input_mib):raise ValueError("SerializedFile exceeds reviewed byte budget")
    import UnityPy
    from unity_decode_budget import install
    install()
    import struct
    metadata_size,file_size,format_version,data_offset=struct.unpack('>IIII',data[:16])
    if not 9<=format_version<=22:raise ValueError('unsupported serialized file version; supported range is 9..22')
    if format_version>=22:
        if len(data)<48:raise ValueError('truncated extended serialized header')
        metadata_size,file_size,data_offset=struct.unpack('>Iqq',data[20:40])
    if file_size!=len(data) or not 0<data_offset<=file_size or metadata_size>file_size:raise ValueError('invalid serialized header sizes')
    if sys.platform.startswith('linux'):
        import resource
        resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
        resource.setrlimit(resource.RLIMIT_CPU,(30,30))
    # Observe index entries at the pinned producer boundary, before its dict
    # can overwrite duplicate PathIDs or hide index coverage.
    from UnityPy.files.ObjectReader import ObjectReader
    original_reader=ObjectReader.from_reader.__func__
    seen={}
    def checked_reader(cls,assets_file,reader):
        obj=original_reader(cls,assets_file,reader)
        identifiers=seen.setdefault(id(assets_file),set())
        if obj.path_id in identifiers:raise ValueError(f'duplicate serialized PathID: {obj.path_id}')
        if len(identifiers)>=100000:raise ValueError('serialized object count exceeds 100000')
        identifiers.add(obj.path_id)
        return obj
    ObjectReader.from_reader=classmethod(checked_reader)
    try:
        env=UnityPy.Environment()
        env.load_file(data,name=name)
        return env
    finally:
        ObjectReader.from_reader=classmethod(original_reader)


def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--path-id');p.add_argument('--serialized-file');p.add_argument('--field');p.add_argument('--max-input-mib',type=int,default=64);p.add_argument('--offset',type=int,default=0);p.add_argument('--limit',type=int,default=20);args=p.parse_args()
    try:
        import UnityPy
    except ImportError:
        print(json.dumps({'status':'unavailable','code':'TOOL_UNAVAILABLE','message':'Install the project-local requirements-unity.txt and set REA_UNITY_PYTHON to that environment.'}));return 0
    from importlib.metadata import version
    tool_version=version('UnityPy')
    if tool_version!='1.25.4':
        print(json.dumps({'status':'unavailable','code':'TOOL_VERSION','message':f'This adapter is pinned to UnityPy 1.25.4; found {tool_version}.'}));return 0
    if args.offset<0 or args.limit<1 or args.limit>100:raise ValueError('invalid object page')
    # Parse only a single admitted serialized file; archive expansion belongs to intake.
    stable=StableInput.open(args.input)
    try:
        if stable.size>input_budget_bytes(args.max_input_mib):raise ValueError('serialized input exceeds reviewed byte budget')
        data=stable.handle.read()
        if len(data)<20 or data.startswith((b'UnityFS',b'UnityWeb',b'UnityRaw',b'PK')):
            raise ValueError('Supply one extracted Unity SerializedFile; bundles/APKs require bounded extraction first.')
        env=load_serialized(data,args.input.name,args.max_input_mib)
        objects=list(env.objects)
        if len(objects)>100000:raise ValueError('serialized object count exceeds 100000')
        objects.sort(key=lambda o:(str(o.assets_file.name),o.path_id))
        def row(obj):return {'serialized_file':str(obj.assets_file.name),'path_id':str(obj.path_id),'type':obj.type.name,'byte_start':obj.byte_start,'byte_size':obj.byte_size,'unity_version':obj.assets_file.unity_version}
        result={'status':'complete','provider':'UnityPy','tool_version':tool_version,'source_sha256':stable.sha256,'object_count':len(objects),'does_not_prove':['runtime selection','method implementation','project GUID/fileID identity','gameplay parity']}
        if args.path_id is None:
            result.update(objects=[row(o) for o in objects[args.offset:args.offset+args.limit]],offset=args.offset,truncated=len(objects)>args.offset+args.limit)
        else:
            matches=[o for o in objects if str(o.path_id)==args.path_id and (args.serialized_file is None or str(o.assets_file.name)==args.serialized_file)]
            if len(matches)!=1:raise ValueError('object locator is absent or ambiguous; qualify the serialized file and PathID')
            obj=matches[0];record=row(obj);raw=obj.get_raw_data();record['raw_sha256']=hashlib.sha256(raw).hexdigest()
            try:
                tree=obj.parse_as_dict()
                if args.field is not None:
                    if args.field not in tree:raise ValueError('selected top-level field is absent')
                    tree={args.field:tree[args.field]}
                fields=encode(tree);encoded=json.dumps(fields,ensure_ascii=True,allow_nan=False)
                record['fields']=fields if len(encoded)<=32768 else {'omitted':True,'serialized_characters':len(encoded),'next':'Select one exact top-level field.'}
                result['truncated']=len(encoded)>32768
            except Exception as error:
                record['fields']=None;record['decode_error']=str(error);result['status']='partial';result['truncated']=False
            result['object']=record
        stable.verify_unchanged();print(json.dumps(result,ensure_ascii=True,allow_nan=False));return 0
    finally:stable.close()

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:print(json.dumps({'error':str(error)}),file=sys.stderr);sys.exit(2)
