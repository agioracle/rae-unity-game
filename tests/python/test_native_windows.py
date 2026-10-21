import importlib.util,sys,unittest,struct
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_windows',Path(__file__).parents[2]/'python/native_windows.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class NativeWindowTests(unittest.TestCase):
 def test_offsets_are_derived_from_elf_segments_and_keep_navigation_boundaries(self):
  b=bytearray(512);b[:7]=b'\x7fELF\x02\x01\x01';struct.pack_into('<H',b,18,183);struct.pack_into('<Q',b,32,64);struct.pack_into('<HH',b,54,56,1);struct.pack_into('<IIQQQQQQ',b,64,1,5,128,4096,4096,256,256,4096)
  self.assertEqual(module.elf_offset(b,4100,8),132)
  with self.assertRaisesRegex(ValueError,'segment'):module.elf_offset(b,4350,8)
 def test_other_architectures_are_explicitly_unsupported(self):
  b=bytearray(64);b[:7]=b'\x7fELF\x02\x01\x01';struct.pack_into('<H',b,18,62)
  with self.assertRaisesRegex(ValueError,'ARM64'):module.elf_offset(b,0,4)
 def test_symbol_selection_preserves_other_game_names_and_overload_ambiguity(self):
  rows=[{'assembly':'Gameplay','token':'0x06000123','full_name':'Blink::Cancel','has_native_pointer':True,'virtual_address':'0x1010'}]
  self.assertEqual(module.select_methods(rows,[{'assembly':'Gameplay','token':'0x06000123'}])[0]['full_name'],'Blink::Cancel')
  with self.assertRaisesRegex(ValueError,'exactly one'):module.select_methods(rows+rows,[{'assembly':'Gameplay','token':'0x06000123'}])
  with self.assertRaisesRegex(ValueError,'exactly one'):module.select_methods(rows,[{'assembly':'Other','token':'0x06000123'}])
if __name__=='__main__':unittest.main()

class NativeOutputBudgetTests(unittest.TestCase):
 @unittest.skipUnless(importlib.util.find_spec("capstone"),"Optional Capstone provider not installed")
 def test_shared_alias_fanout_is_rejected_before_json_allocation(self):
  import tempfile,json,hashlib
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder).resolve();b=bytearray(128+4096);b[:7]=b'\x7fELF\x02\x01\x01';struct.pack_into('<H',b,18,183);struct.pack_into('<Q',b,32,64);struct.pack_into('<HH',b,54,56,1);struct.pack_into('<IIQQQQQQ',b,64,1,5,128,4096,4096,4096,4096,4096)
   b[128:]=b''.join(struct.pack('<I',0x14000000|((-i)&0x3ffffff)) for i in range(1024))
   (root/'binary').write_bytes(b);(root/'metadata').write_bytes(b'metadata');(root/'provenance').write_bytes(b'provider')
   rows=[{'assembly':'Game','token':hex(0x06000000+i),'full_name':'Shared::Method'+str(i),'has_native_pointer':True,'virtual_address':'0x1000'} for i in range(10000)]
   rows.append({'assembly':'Game','token':'0x06010000','full_name':'Boundary','has_native_pointer':True,'virtual_address':'0x2000'})
   (root/'catalog.jsonl').write_text('\n'.join(json.dumps(r) for r in rows))
   sources=[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in ['binary','metadata','catalog.jsonl','provenance']]
   report=root/'map.json';report.write_text(json.dumps({'sources':sources}))
   with self.assertRaisesRegex(ValueError,'output budget'):module.inspect(root,report,hashlib.sha256(report.read_bytes()).hexdigest(),[{'assembly':'Game','token':'0x6000000'}],4096)

class Arm32NativeTests(unittest.TestCase):
 def fixture(self,folder,thumb):
  import json,hashlib
  root=Path(folder).resolve();b=bytearray(136);b[:7]=b'\x7fELF\x01\x01\x01';struct.pack_into('<H',b,18,40);struct.pack_into('<I',b,28,52);struct.pack_into('<HH',b,42,32,1);struct.pack_into('<IIIIIIII',b,52,1,128,4096,4096,8,8,5,4096);b[128:]=bytes.fromhex('00bf704700bf7047') if thumb else bytes.fromhex('0000a0e11eff2fe1')
  (root/'binary').write_bytes(b);(root/'metadata').write_bytes(b'metadata');(root/'provenance').write_bytes(b'provider')
  rows=[{'assembly':'Game','token':'0x06000001','full_name':'DraftChoice::Commit','has_native_pointer':True,'virtual_address':hex(4097 if thumb else 4096)},{'assembly':'Game','token':'0x06000002','full_name':'Boundary','has_native_pointer':True,'virtual_address':hex(4101 if thumb else 4104)}]
  (root/'catalog.jsonl').write_text('\n'.join(json.dumps(r) for r in rows));sources=[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in ['binary','metadata','catalog.jsonl','provenance']];report=root/'map.json';report.write_text(json.dumps({'sources':sources}));return root,report,hashlib.sha256(report.read_bytes()).hexdigest()
 def test_elf32_file_offset_comes_from_program_headers(self):
  import tempfile
  with tempfile.TemporaryDirectory() as d:
   root,_,_=self.fixture(d,True);self.assertEqual(module.elf_offset((root/'binary').read_bytes(),4096,4),128)
 @unittest.skipUnless(importlib.util.find_spec('capstone'),'Optional Capstone provider not installed')
 def test_arm_and_thumb_modes_derive_from_each_selected_provider_pointer(self):
  import tempfile
  for thumb in [False,True]:
   with self.subTest(thumb=thumb),tempfile.TemporaryDirectory() as d:
    root,report,h=self.fixture(d,thumb);result=module.inspect(root,report,h,[{'assembly':'Game','token':'0x06000001'}],8);m=result['methods'][0];self.assertEqual(m['instruction_set'],'thumb' if thumb else 'arm');self.assertEqual(m['elf_va'],'0x1000');self.assertEqual(m['file_offset'],'0x80');self.assertEqual(m['instructions'][-1]['mnemonic'],'bx')
