using System;using System.Text;using System.Buffers.Binary;
public class RegistrationLocatorFixture {
 static void Put(byte[] b,int p,uint v)=>BinaryPrimitives.WriteUInt32LittleEndian(b.AsSpan(p,4),v);
 public static void Main(){var b=new byte[2048];Encoding.UTF8.GetBytes("mscorlib.dll\0").CopyTo(b,0x100);Put(b,0x180,0x100);Put(b,0x204,0x180);Put(b,0x300,0x200);Put(b,0x2fc,3);Put(b,0x400,0x200);Put(b,0x3fc,999);Put(b,0x500,0x200);Put(b,0x4fc,0);
 var r=ReaRegistrationLocator.Find(b,4,3,68,"mscorlib.dll",v=>(long)v,r=>(ulong)r,_=>true);if(r!=0x2c0)throw new Exception("decoy references must be filtered before uniqueness");
 Put(b,0x3fc,3);bool rejected=false;try{ReaRegistrationLocator.Find(b,4,3,68,"mscorlib.dll",v=>(long)v,r=>(ulong)r,_=>true);}catch(System.IO.InvalidDataException){rejected=true;}if(!rejected)throw new Exception("genuine ambiguity must be rejected");
 r=ReaRegistrationLocator.Find(b,4,3,68,"mscorlib.dll",v=>(long)v,r=>(ulong)r,a=>a==0x2c0);if(r!=0x2c0)throw new Exception("provider structural validation must reject false candidates");Console.WriteLine("3 registration locator fixtures passed");}
}
