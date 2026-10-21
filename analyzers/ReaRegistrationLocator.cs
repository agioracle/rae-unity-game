using System;
using System.Collections.Generic;
using System.Buffers.Binary;
using System.IO;
using System.Linq;
using System.Text;

// Independent bounded xref search. Exact module-count and provider structural checks
// precede uniqueness; multiple raw references to a module array are normal data.
public static class ReaRegistrationLocator
{
    public static ulong Find(byte[] data,int pointerBytes,int moduleCount,int registrationBytes,string anchorName,
        Func<ulong,long> toRaw,Func<long,ulong> toVirtual,Func<ulong,bool> validate)
    {
        if(data.Length>512*1024*1024 || (pointerBytes!=4&&pointerBytes!=8) || moduleCount<1||moduleCount>4096 || registrationBytes<pointerBytes*2||registrationBytes>256) throw new InvalidDataException("Registration search budget exceeded");
        ulong Word(int p)=>pointerBytes==4?BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(p,4)):BinaryPrimitives.ReadUInt64LittleEndian(data.AsSpan(p,8));
        bool Map(long p,out ulong va){try{va=toVirtual(p);return toRaw(va)==p;}catch{va=0;return false;}}
        var anchor=Encoding.UTF8.GetBytes(anchorName+"\0");var names=new HashSet<ulong>();int start=0;
        while(start<data.Length){int found=data.AsSpan(start).IndexOf(anchor);if(found<0)break;int at=start+found;if(Map(at,out var va))names.Add(va);if(names.Count>64)throw new InvalidDataException("Too many registration anchors");start=at+anchor.Length;}
        HashSet<ulong> References(HashSet<ulong> addresses){var result=new HashSet<ulong>();for(int p=0;p<=data.Length-pointerBytes;p+=pointerBytes)if(addresses.Contains(Word(p))&&Map(p,out var va)){result.Add(va);if(result.Count>16384)throw new InvalidDataException("Registration xref budget exceeded");}return result;}
        var moduleHeaders=References(names);var arrayEntries=References(moduleHeaders);var starts=new HashSet<ulong>();
        foreach(var entry in arrayEntries)for(int i=0;i<moduleCount;i++){ulong back=(ulong)(i*pointerBytes);if(entry>=back)starts.Add(entry-back);if(starts.Count>262144)throw new InvalidDataException("Registration table budget exceeded");}
        var accepted=new HashSet<ulong>();
        for(int p=pointerBytes;p<=data.Length-pointerBytes;p+=pointerBytes)
        {
            if(!starts.Contains(Word(p)) || Word(p-pointerBytes)!=(ulong)moduleCount)continue;
            long raw=p-registrationBytes+pointerBytes;if(raw<0||!Map(raw,out var candidate))continue;
            if(validate(candidate))accepted.Add(candidate);
        }
        if(accepted.Count!=1)throw new InvalidDataException("Registration search must resolve to one structurally valid candidate; found "+accepted.Count);
        return accepted.Single();
    }
}
