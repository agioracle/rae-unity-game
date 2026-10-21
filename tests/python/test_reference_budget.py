import sys,unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).parents[2]/'python'))
from unity_references import trace
class Object:
 def __init__(self,tree):self.type=SimpleNamespace(name='Fixture');self.tree=tree
 def parse_as_dict(self):return self.tree
class GraphBudgetTests(unittest.TestCase):
 def test_exact_edge_limit_marks_pending_nodes_truncated(self):
  root=Object({'refs':[{'m_FileID':0,'m_PathID':2} for _ in range(2000)]});child=Object({'missing':{'m_FileID':0,'m_PathID':99}})
  files={'a.assets':{'sha256':'0'*64,'file':SimpleNamespace(objects={1:root,2:child},externals=[])}}
  r=trace(files,'a.assets','1',5,100)
  self.assertTrue(r['truncated']);self.assertEqual(r['status'],'partial')
