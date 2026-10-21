"""Valid built GameObject references, including external SerializedFile links."""
import struct,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from importlib.machinery import SourceFileLoader
aligned_string=SourceFileLoader('asset_fixture',str(Path(__file__).parent/'create-unity-asset.py')).load_module().aligned_string

def asset(name,refs,external):
 data=struct.pack('<i',len(refs))+b''.join(struct.pack('<iq',*r) for r in refs)+struct.pack('<I',0)+aligned_string(name)+struct.pack('<H?',0,True)
 m=b'2018.4.0f1\0'+struct.pack('<i?i',19,False,1)+struct.pack('<i?h',1,False,-1)+bytes(16)+struct.pack('<i',1)
 m+=bytes((-len(m))%4)+struct.pack('<qIIi',1,0,len(data),0)+struct.pack('<i',0)+struct.pack('<i',1 if external else 0)
 if external:m+=b'\0'+bytes(16)+struct.pack('<i',0)+external.encode()+b'\0'
 m+=b'\0';offset=(20+len(m)+15)//16*16
 return struct.pack('>IIII',len(m),offset+len(data),17,offset)+bytes(4)+m+bytes(offset-20-len(m))+data
root=Path(sys.argv[1])/'Player';root.mkdir()
(root/'a.assets').write_bytes(asset('Root',[(1,1),(0,99)],'b.assets'))
(root/'b.assets').write_bytes(asset('Dependency',[(1,1)],'a.assets'))
