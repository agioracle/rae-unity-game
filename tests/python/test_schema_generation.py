import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('generator',Path(__file__).resolve().parents[2]/'scripts/generate-component-schema.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SchemaGenerationTests(unittest.TestCase):
 def test_string_collection_is_not_scalar_string(self):
  nodes=[{'m_Type':t,'m_Name':n,'m_Level':l,'m_MetaFlag':0} for t,n,l in [('MonoBehaviour','Base',0),('string','labels',1),('Array','Array',2),('int','size',3),('string','data',3),('Array','Array',4),('int','size',5),('char','data',5)]]
  result,changes=module.normalize_provider_nodes(nodes)
  self.assertEqual(result[1]['m_Type'],'vector');self.assertEqual(result[4]['m_Type'],'string');self.assertEqual(nodes[1]['m_Type'],'string');self.assertEqual(len(changes),1)
 def test_scalar_and_unfamiliar_shapes_are_preserved(self):
  nodes=[{'m_Type':t,'m_Name':n,'m_Level':l,'m_MetaFlag':0} for t,n,l in [('MonoBehaviour','Base',0),('string','label',1),('Array','Array',2),('int','size',3),('char','data',3)]]
  result,changes=module.normalize_provider_nodes(nodes);self.assertEqual(result,nodes);self.assertEqual(changes,[])
