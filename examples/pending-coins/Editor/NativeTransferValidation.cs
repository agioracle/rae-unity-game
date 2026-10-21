using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Reconstructed.Gameplay;

[InitializeOnLoad]
public static class NativeTransferValidation
{
    private static readonly List<string> Cases = new List<string>();
    private const string Key = "rea-unity-game.isolated-transfer-check";
    private static DateTime deadline;
    [Serializable] private sealed class Result { public string unity_version; public string status; public string[] cases; public string limit; }
    static NativeTransferValidation()
    {
        if (!SessionState.GetBool("rea-transfer-validation-active", false)) return;
        deadline = DateTime.UtcNow.AddSeconds(30);
        EditorApplication.update += Watchdog;
        EditorApplication.playModeStateChanged += Changed;
    }
    public static void Run()
    {
        SessionState.SetBool("rea-transfer-validation-active", true);
        deadline = DateTime.UtcNow.AddSeconds(30);
        EditorApplication.update += Watchdog;
        EditorApplication.playModeStateChanged += Changed;
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var go = new GameObject("Transferred pending coins");
        var feature = go.AddComponent<PendingCoinsFeature>();
        feature.UseIsolatedKey(Key);
        go.AddComponent<PendingCoinsView>().Bind(feature);
        PrefabUtility.SaveAsPrefabAsset(go, "Assets/PendingCoinRecreation/PendingCoins.prefab");
        EditorSceneManager.SaveScene(scene, "Assets/PendingCoinRecreation/PendingCoins.unity");
        AssetDatabase.SaveAssets();
        PlayerPrefs.DeleteKey(Key);
        EditorApplication.isPlaying = true;
    }
    private static void Watchdog()
    {
        if (DateTime.UtcNow > deadline) Finish("timeout", "PlayMode entry did not complete");
    }
    private static void Check(bool value, string name)
    {
        if (!value) throw new InvalidOperationException(name);
        Cases.Add(name);
    }
    private static void Changed(PlayModeStateChange state)
    {
        if (state != PlayModeStateChange.EnteredPlayMode) return;
        try
        {
            var feature = UnityEngine.Object.FindObjectOfType<PendingCoinsFeature>();
            var view = feature.GetComponent<PendingCoinsView>();
            PlayerPrefs.SetInt(Key, -4); Check(feature.Balance == 0, "negative storage clamps to zero");
            feature.Set(-1); Check(PlayerPrefs.GetInt(Key) == 0, "negative setter saves zero");
            feature.Add(-2); feature.Add(0); Check(feature.Balance == 0, "nonpositive additions ignored");
            view.AddRequested(); feature.Add(7); Check(feature.Balance == 12, "input command and positive additions sum");
            Check(feature.Consume() == 12 && feature.Balance == 0, "consume returns amount then clears");
            Check(feature.Consume() == 0, "repeat consume is zero");
            feature.Set(int.MaxValue); feature.Add(1); Check(feature.Balance == 0, "int32 overflow wraps then clamps");
            feature.Set(9); feature.gameObject.SetActive(false); feature.gameObject.SetActive(true); Check(feature.Balance == 9, "disable/re-enable preserves balance");
            var other = new GameObject("Persistence probe").AddComponent<PendingCoinsFeature>(); other.UseIsolatedKey(Key); Check(other.Balance == 9, "new instance reads persisted value");
            view.ConsumeRequested(); Check(feature.Balance == 0, "consume input command clears balance");
            UnityEngine.Object.Destroy(other.gameObject);
            Finish("pass", "Actual Unity PlayMode command, state, persistence and lifecycle checks. No Android runtime, hardware click, source-game execution or visual parity check.");
        }
        catch (Exception e) { Finish("fail", e.ToString()); }
    }
    private static void Finish(string status, string limit)
    {
        SessionState.EraseBool("rea-transfer-validation-active");
        EditorApplication.update -= Watchdog;
        EditorApplication.playModeStateChanged -= Changed;
        PlayerPrefs.DeleteKey(Key); PlayerPrefs.Save();
        var root = Directory.GetParent(Application.dataPath).FullName;
        File.WriteAllText(Path.Combine(root, "transfer-validation.json"), JsonUtility.ToJson(new Result { unity_version = Application.unityVersion, status = status, cases = Cases.ToArray(), limit = limit }, true));
        EditorApplication.Exit(status == "pass" ? 0 : 2);
    }
}
