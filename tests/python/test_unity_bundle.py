import sys,unittest,struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[2]/'python'))
from unity_bundle import inventory
from io import BytesIO

def bundle(path='level0',declared=4):
 info=bytes(16)+struct.pack('>iIIHiqqI',1,declared,4,0,1,0,4,0)+path.encode()+b'\0'
 header=b'UnityFS\0'+struct.pack('>I',6)+b'5.x.x\0' + b'2018.4.0f1\0'
 return header+struct.pack('>qIII',len(header)+20+len(info)+4,len(info),len(info),64)+info+b'data'
class BundleTests(unittest.TestCase):
 def test_admits_exact_offsets_before_decompression(self):
  result=inventory(BytesIO(bundle()),len(bundle()));self.assertEqual(result['nodes'][0]['path'],'level0')
 def test_preflight_ratio_within_absolute_budget(self):
  self.assertEqual(inventory(BytesIO(bundle(declared=1024)),len(bundle(declared=1024)))['uncompressed_bytes'],1024)
 def test_traversal_and_decompression_budgets_precede_output(self):
  with self.assertRaises(ValueError):inventory(BytesIO(bundle('../escape')),len(bundle('../escape')))
  with self.assertRaises(ValueError):inventory(BytesIO(bundle(declared=2**31)),len(bundle(declared=2**31)))
if __name__=='__main__':unittest.main()
