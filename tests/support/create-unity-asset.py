"""Generate a valid minimal Unity SerializedFile v17 TextAsset for parser tests."""
import struct
from pathlib import Path
import sys

def aligned_string(value):
    data=value.encode('utf-8')
    result=struct.pack('<i',len(data))+data
    return result+b'\0'*((-len(result))%4)

def create_asset(duplicate=False):
    data=aligned_string('FixtureConfig')+aligned_string('{"cooldown":3}')
    metadata=b'2018.4.0f1\0'+struct.pack('<i?i',19,False,1)
    metadata+=struct.pack('<i?h',49,False,-1)+bytes(16)
    metadata+=struct.pack('<i',2 if duplicate else 1)
    metadata+=bytes((-len(metadata))%4)
    metadata+=struct.pack('<qIIi',9007199254740993,0,len(data),0)*(2 if duplicate else 1)
    metadata+=struct.pack('<ii',0,0)+b'\0'
    offset=(20+len(metadata)+15)//16*16
    header=struct.pack('>IIII',len(metadata),offset+len(data),17,offset)+bytes(4)
    return header+metadata+bytes(offset-20-len(metadata))+data

if __name__=='__main__':Path(sys.argv[1]).write_bytes(create_asset(duplicate="--duplicate" in sys.argv))
