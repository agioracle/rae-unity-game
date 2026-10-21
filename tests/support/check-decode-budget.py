import struct,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[2]/'python'))
from unity_objects import load_serialized
from UnityPy.helpers.TypeTreeNode import TypeTreeNode
from UnityPy.streams import EndianBinaryWriter

def fixture(class_id):
 nodes=[]
 for level,typ,name,size in [(0,'Test','Base',-1),(1,'vector','items',-1),(2,'Array','Array',-1),(3,'int','size',4),(3,'Empty','data',0)]:nodes.append(dict(m_Level=level,m_Type=typ,m_Name=name,m_ByteSize=size,m_Version=1,m_TypeFlags=0,m_Index=len(nodes),m_MetaFlag=0))
 writer=EndianBinaryWriter(endian='<');TypeTreeNode.from_list(nodes).dump_blob(writer,17)
 m=b'2018.4.0f1\0'+struct.pack('<i?i',19,True,1)+struct.pack('<i?h',class_id,False,-1)+bytes(16)+writer.bytes+struct.pack('<i',1)
 m+=bytes((-len(m))%4)+struct.pack('<qIIi',1,0,4,0)+struct.pack('<ii',0,0)+b'\0';offset=(20+len(m)+15)//16*16
 return struct.pack('>IIII',len(m),offset+4,17,offset)+bytes(4)+m+bytes(offset-20-len(m))+struct.pack('<i',100001)
for kind in (49,142):
 try:
  env=load_serialized(fixture(kind),'budget.assets');next(iter(env.objects)).parse_as_dict()
 except ValueError as e:
  assert 'budget' in str(e).lower(),str(e)
 else:raise AssertionError('decode expanded 100001 empty records before enforcing budget')
print('ordinary and load-time AssetBundle decodes reject expansion before allocation')
