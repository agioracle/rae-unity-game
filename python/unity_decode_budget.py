"""Pinned UnityPy producer guards; budgets apply before container allocation.

Disable the native bulk decoder so Python producer boundaries can enforce a
per-object and per-process value budget, including automatic AssetBundle reads.
"""
_installed=False

def install():
    global _installed
    if _installed:return
    _installed=True
    from UnityPy.helpers import TypeTreeHelper as helper
    from UnityPy.helpers.TypeTreeNode import TypeTreeNode
    from UnityPy.files.SerializedFile import SerializedType
    original_tree=helper.read_typetree
    original_value=helper.read_value
    original_array=helper.read_value_array
    original_blob=TypeTreeNode.parse_blob.__func__
    original_legacy=TypeTreeNode.parse.__func__
    original_type=SerializedType.__init__
    aggregate={'values':500000,'nodes':100000,'strings':16*1024*1024,'types':10000}
    frames=[]
    def take(n):
        if not isinstance(n,int) or n<0 or not frames or n>frames[-1]['remaining'] or n>aggregate['values']:raise ValueError('Unity decode value budget exceeded before allocation')
        frames[-1]['remaining']-=n;aggregate['values']-=n
    def tree(*args,**kwargs):
        frames.append({'remaining':100000,'depth':0})
        try:return original_tree(*args,**kwargs)
        finally:frames.pop()
    def value(node,reader,config):
        take(1);frame=frames[-1];frame['depth']+=1
        try:
            if frame['depth']>128:raise ValueError('Unity decode depth budget exceeded')
            if node.m_Children and node.m_Children[0].m_Type=='Array':
                pos=reader.Position
                try:size=reader.read_int()
                finally:reader.Position=pos
                if size<0 or size>frame['remaining'] or size>aggregate['values']:raise ValueError('Unity decode array budget exceeded before allocation')
            return original_value(node,reader,config)
        finally:frame['depth']-=1
    def array(node,reader,config,size):
        take(size)
        # Native helper list/tuple producers must never receive an unchecked count.
        return original_array(node,reader,config,size)
    def blob(cls,reader,version):
        pos=reader.Position
        try:
            if version>=23:reader.read_bytes(8)
            nodes=reader.read_int();strings=reader.read_int()
            if nodes<=0 or nodes>10000 or nodes>aggregate['nodes'] or strings<0 or strings>4*1024*1024 or strings>aggregate['strings']:raise ValueError('Unity TypeTree metadata budget exceeded')
            aggregate['nodes']-=nodes;aggregate['strings']-=strings
        finally:reader.Position=pos
        return original_blob(cls,reader,version)
    def legacy(cls,reader,version):
        # Preflight the child counts before the legacy parser allocates lists.
        pos=reader.Position;pending=1;nodes=0
        try:
            while pending:
                pending-=1;nodes+=1
                if nodes>10000 or nodes>aggregate['nodes']:raise ValueError('Unity legacy TypeTree budget exceeded')
                if len(reader.read_string_to_null())>4096 or len(reader.read_string_to_null())>4096:raise ValueError('Unity TypeTree string budget exceeded')
                reader.read_int() # byte size
                if version==2:reader.read_int()
                if version!=3:reader.read_int()
                reader.read_int();reader.read_int()
                if version!=3:reader.read_int()
                children=reader.read_int()
                if children<0 or nodes+pending+children>10000:raise ValueError('Unity legacy TypeTree child budget exceeded')
                pending+=children
            aggregate['nodes']-=nodes
        finally:reader.Position=pos
        return original_legacy(cls,reader,version)
    def serialized_type(self,*args,**kwargs):
        aggregate['types']-=1
        if aggregate['types']<0:raise ValueError('Unity serialized type budget exceeded')
        original_type(self,*args,**kwargs)
    helper.read_typetree_boost=None
    helper.read_typetree=tree;helper.read_value=value;helper.read_value_array=array
    TypeTreeNode.parse_blob=classmethod(blob);TypeTreeNode.parse=classmethod(legacy)
    SerializedType.__init__=serialized_type
