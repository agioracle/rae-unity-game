using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using AssetRipper.Primitives;
using LibCpp2IL;
using LibCpp2IL.Metadata;
using LibCpp2IL.BinaryStructures;
using System.Collections.Generic;

// Metadata and pointer navigation only. Native bytes remain the implementation evidence.
public static class ReaIl2CppIndexer
{
    public static int Main(string[] args)
    {
        if (args.Length != 4) { Console.Error.WriteLine("usage: binary metadata exact-unity-version NEW-output"); return 2; }
        var output = args[3]; Directory.CreateDirectory(output);
        var binaryHash = Hash(args[0]); var metadataHash = Hash(args[1]);
        LibCpp2IlMain.Settings.AllowManualMetadataAndCodeRegInput = false;
        Il2CppBinary.OnRegistrationStructLocationFailure += RecoverRegistration;
        var context = LibCpp2IlMain.LoadFromFileAsContext(args[0], args[1], UnityVersion.Parse(args[2]));
        var metadata = context.Metadata;
        int count = 0, withPointer = 0;
        using (var writer = new StreamWriter(Path.Combine(output, "methods.jsonl")))
        {
            foreach (var method in metadata.methodDefs)
            {
                if (++count > 200000) throw new InvalidDataException("Method count exceeds 200000");
                var declaring = method.DeclaringType;
                var address = method.MethodPointer;
                if (address != 0) withPointer++;
                var type = declaring?.FullName ?? declaring?.Name ?? "<unknown>";
                var assembly = declaring?.DeclaringAssembly?.Name ?? "<unknown>";
                if (assembly.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)) assembly = assembly.Substring(0, assembly.Length - 4);
                writer.WriteLine(JsonSerializer.Serialize(new {
                    assembly, token = "0x" + method.token.ToString("X8"),
                    full_name = type + "::" + method.Name,
                    signature = method.HumanReadableSignature ?? type + "::" + method.Name,
                    virtual_address = "0x" + address.ToString("X"), rva = "0x" + context.Binary.GetRva(address).ToString("X"),
                    file_offset = (long?)null, has_native_pointer = address != 0,
                    offset_provenance = "Not reported; derived independently from ELF PT_LOAD by the REA Unity mapper."
                }));
            }
        }
        if (Hash(args[0]) != binaryHash || Hash(args[1]) != metadataHash) throw new InvalidDataException("Input changed during recovery");
        var summary = new {
            schema_version = 1,
            generator = new { name = "ReaIl2CppIndexer", libcpp2il = System.Reflection.CustomAttributeExtensions.GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(typeof(LibCpp2IlMain).Assembly)?.InformationalVersion, framework = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription },
            inputs = new { binary_sha256 = binaryHash, metadata_sha256 = metadataHash, requested_unity_version = args[2] },
            parsed = new { unity_version = args[2], metadata_version = BitConverter.ToUInt32(File.ReadAllBytes(args[1]), 4), method_definition_count = count, methods_with_native_pointer = withPointer },
            truncation = new { truncated = false },
            limits = new [] { "Navigation declarations and method pointers are not original C# bodies.", "Generic instantiation, indirect calls and runtime selection require further evidence." }
        };
        File.WriteAllText(Path.Combine(output, "summary.json"), JsonSerializer.Serialize(summary, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine(JsonSerializer.Serialize(new { methods = count, with_native_pointer = withPointer }));
        return 0;
    }
    public static void RecoverRegistration(Il2CppBinary binary, Il2CppMetadata metadata,ref Il2CppCodeRegistration? code,ref Il2CppMetadataRegistration? meta)
    {
        if(code!=null || meta==null || metadata.MetadataVersion<27 || metadata.MetadataVersion>39)return;
        var expected=metadata.imageDefinitions.Select(i=>i.Name??throw new InvalidDataException("Metadata image name is absent")).ToHashSet(StringComparer.Ordinal);
        if(expected.Count!=metadata.imageDefinitions.Length)throw new InvalidDataException("Metadata image names are not unique");
        var anchor=expected.Contains("mscorlib.dll")?"mscorlib.dll":expected.Contains("System.Private.CoreLib.dll")?"System.Private.CoreLib.dll":null;
        if(anchor==null)return;
        var fields=typeof(Il2CppCodeRegistration).GetFields().ToDictionary(f=>f.Name);
        bool Valid(ulong va)
        {
            try {
                var candidate=binary.ReadReadableAtVirtualAddress<Il2CppCodeRegistration>(va);
                if(candidate.codeGenModulesCount!=(ulong)expected.Count || !BinarySearcher.ValidateCodeRegistration(candidate,fields,binary))return false;
                var pointers=binary.ReadNUintArrayAtVirtualAddress(candidate.addrCodeGenModulePtrs,expected.Count);
                var names=new HashSet<string>(StringComparer.Ordinal);
                foreach(var ptr in pointers){var module=binary.ReadReadableAtVirtualAddress<Il2CppCodeGenModule>(ptr);if(module.methodPointerCount>500000||!expected.Contains(module.Name)||!names.Add(module.Name))return false;}
                return names.SetEquals(expected);
            }catch{return false;}
        }
        var address=ReaRegistrationLocator.Find(binary.GetRawBinaryContent().ToArray(),binary.PointerSizeBytes,expected.Count,Il2CppCodeRegistration.GetStructSize(binary.is32Bit,metadata.MetadataVersion),anchor,v=>binary.MapVirtualAddressToRaw(v),r=>binary.MapRawAddressToVirtual(checked((uint)r)),Valid);
        code=binary.ReadReadableAtVirtualAddress<Il2CppCodeRegistration>(address);
        Console.WriteLine("REA bounded registration fallback accepted 0x"+address.ToString("X")+" after complete module-name validation");
    }
    private static string Hash(string path) { using var file = File.OpenRead(path); return Convert.ToHexString(SHA256.HashData(file)).ToLowerInvariant(); }
}
