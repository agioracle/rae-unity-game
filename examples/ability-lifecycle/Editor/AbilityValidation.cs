using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Reconstructed.Abilities;

[InitializeOnLoad]
public static class AbilityValidation
{
    [Serializable] private class Result { public string status; public string unity_version; public string[] cases; public string limit; }
    private static readonly List<string> Cases = new List<string>();
    private static void Check(bool value, string name) { if (!value) throw new Exception(name); Cases.Add(name); }
    private static bool Near(float a,float b) { return Mathf.Abs(a-b)<0.0001f; }
    private static DateTime began;
    static AbilityValidation(){if(SessionState.GetBool("rea-ability-play",false)){Cases.AddRange(SessionState.GetString("rea-ability-cases","").Split(new[]{'\n'},StringSplitOptions.RemoveEmptyEntries));EditorApplication.playModeStateChanged+=Entered;}}
    private static void Entered(PlayModeStateChange change){if(change!=PlayModeStateChange.EnteredPlayMode)return;try{var component=UnityEngine.Object.FindObjectOfType<AbilityLifecycle>();Check(component!=null&&component.State.CanPrime,"actual PlayMode imports and initializes integrated component");component.State.Tick(0f,true,false);component.State.Tick(0.1f,true,false);component.gameObject.SetActive(false);component.gameObject.SetActive(true);component.State.Tick(0f,false,false);Check(!component.State.IsPrimed&&component.State.CanPrime,"actual disable/re-enable clears input without losing ready charge");component.State.Activate();SessionState.SetFloat("rea-ability-timescale",Time.timeScale);Time.timeScale=0f;began=DateTime.UtcNow;EditorApplication.update+=ObserveUnscaled;}catch(Exception e){Finish("fail: "+e);}}
    private static void ObserveUnscaled(){if((DateTime.UtcNow-began).TotalSeconds<0.3)return;try{var component=UnityEngine.Object.FindObjectOfType<AbilityLifecycle>();Check(Time.timeScale==0f&&component.State.Charge>0.001f,"actual paused PlayerLoop still recharges through unscaled delta");Finish("pass");}catch(Exception e){Finish("fail: "+e);}}
    private static void Finish(string result){Time.timeScale=SessionState.GetFloat("rea-ability-timescale",1f);SessionState.EraseBool("rea-ability-play");EditorApplication.update-=ObserveUnscaled;EditorApplication.playModeStateChanged-=Entered;Write(result);EditorApplication.Exit(result=="pass"?0:2);}
    public static void Run()
    {
        try
        {
            foreach(var path in new[]{"Assets/AbilityLifecycle/Ability.prefab","Assets/AbilityLifecycle/Integrated.unity"})
                if(File.Exists(path)||File.Exists(path+".meta")) throw new IOException("Create-only validation refuses existing asset: "+path);
            var m = new AbilityState(10f,0.5f,false,1f);
            Check(m.CanPrime && m.Charge == 1f, "serialized prefab starts charged and reusable");
            m.Tick(0f,true,false); Check(m.IsPrimed && m.PrimedEvents==1, "dual input primes once");
            m.Tick(0.1f,false,false); Check(!m.IsPrimed && m.CancelledEvents==1 && m.Activations==0 && m.CanPrime,"early release cancels without spending charge");
            m.Tick(0f,true,false); m.Tick(0.5f,true,false); Check(m.IsPrimed && m.Activations==0,"dual input waits for release after threshold");
            m.Tick(0f,false,false); Check(m.Activations==1 && Near(m.Charge,0f) && !m.IsPrimed && !m.Locked,"qualified release spends charge and resets prime");
            m.Tick(1f,false,true); Check(m.Activations==1,"direct input cannot bypass recharge");
            m.Tick(9f,false,false); Check(m.CanPrime && m.RechargedEvents==1 && Near(m.Charge,1f),"unscaled recharge reaches ready exactly once");
            m.Tick(4f,false,false); Check(m.RechargedEvents==1 && m.Charge==1f,"charge clamps without duplicate ready events");
            m.Tick(0.25f,false,true); Check(Near(m.DirectHold,0.25f) && m.Activations==1,"direct hold accumulates independently");
            m.Tick(0f,false,false); Check(m.DirectHold==0f && m.Activations==1,"direct early release resets only its hold");
            m.Tick(0.5f,false,true); Check(m.Activations==2 && m.DirectHold==0f,"direct button triggers while held at threshold");
            m.CanControl=false; m.Tick(20f,false,false); Check(m.Charge==0f,"disabled control blocks recharge");
            m.CanControl=true; m.Tick(10f,false,false); Check(m.CanPrime,"control restoration resumes recharge");
            var once = new AbilityState(10f,0.5f,true,1f); once.Tick(0.5f,false,true); once.Tick(30f,false,false); Check(once.Locked && once.Activations==1 && !once.CanPrime && once.Charge==0f,"single-use policy locks subsequent activation and recharge");
            m.Tick(0f,true,false); m.Tick(0.2f,true,false); Check(Near(m.PrimeFraction,0.4f),"prime UI fraction uses serialized duration");
            m.ClearInput(); m.Tick(0f,false,false); Check(!m.IsPrimed && m.DirectHold==0f,"input lifecycle clearing cancels an incomplete dual hold");
            var scene=EditorSceneManager.OpenScene("Assets/PendingCoinRecreation/PendingCoins.unity",OpenSceneMode.Single);
            Check(UnityEngine.Object.FindObjectOfType<Reconstructed.Gameplay.PendingCoinsFeature>()!=null,"pre-existing target feature and scene retained");
            var go=new GameObject("Transferred ability lifecycle"); var component=go.AddComponent<AbilityLifecycle>();
            var view=go.AddComponent<AbilityView>(); view.Bind(component);
            if(PrefabUtility.SaveAsPrefabAsset(go,"Assets/AbilityLifecycle/Ability.prefab")==null) throw new IOException("Prefab save failed");
            if(!EditorSceneManager.SaveScene(scene,"Assets/AbilityLifecycle/Integrated.unity")) throw new IOException("Scene save failed");
            Check(component.State.CanPrime && !component.State.Locked,"serialized target component initialized from recovered configuration");
            AssetDatabase.SaveAssets(); SessionState.SetBool("rea-ability-play",true);SessionState.SetString("rea-ability-cases",string.Join("\n",Cases));EditorApplication.playModeStateChanged+=Entered;EditorApplication.isPlaying=true;
        }
        catch(Exception e){Write("fail: "+e);EditorApplication.Exit(2);}
    }
    private static void Write(string status){File.WriteAllText(Path.Combine(Directory.GetParent(Application.dataPath).FullName,"ability-validation.json"),JsonUtility.ToJson(new Result{status=status,unity_version=Application.unityVersion,cases=Cases.ToArray(),limit="State/scene checks in actual Editor. Separate real Player input and original APK observations establish runtime checkpoints."},true));}
}
