import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('component_schema',Path(__file__).parents[2]/'python/component_schema.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ComponentSchemaTests(unittest.TestCase):
 def test_rejects_deep_or_discontinuous_nodes_before_unity_node_allocation(self):
  with self.assertRaisesRegex(ValueError,'level'):m.validate_nodes([{'m_Level':0,'m_Name':'Base','m_Type':'Jump'},{'m_Level':2,'m_Name':'x','m_Type':'int'}])
  with self.assertRaisesRegex(ValueError,'budget'):m.validate_nodes([{'m_Level':0,'m_Name':'x','m_Type':'int'}]*4097)
 def test_other_game_type_and_fields_are_not_special_cased(self):
  nodes=[{'m_Level':0,'m_Name':'Base','m_Type':'DashController'},{'m_Level':1,'m_Name':'cooldown','m_Type':'float','m_MetaFlag':0}];self.assertEqual(m.validate_nodes(nodes),nodes)
if __name__=='__main__':unittest.main()
