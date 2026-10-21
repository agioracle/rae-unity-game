using Cpp2IL.Core.Api;
using Cpp2IL.Core.Attributes;
using LibCpp2IL;
[assembly: RegisterCpp2IlPlugin(typeof(ReaRegistrationPlugin))]
public class ReaRegistrationPlugin : Cpp2IlPlugin
{
    public override string Name => "REA bounded registration recovery";
    public override string Description => "Validate full module identity before accepting an otherwise ambiguous registration xref.";
    public override void OnLoad() { Il2CppBinary.OnRegistrationStructLocationFailure += ReaIl2CppIndexer.RecoverRegistration; }
}
