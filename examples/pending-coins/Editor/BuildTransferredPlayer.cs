using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildTransferredPlayer
{
    public static void Build()
    {
        var output = Environment.GetEnvironmentVariable("REA_UNITY_PLAYER_OUTPUT");
        if (string.IsNullOrEmpty(output) || Directory.Exists(output)) throw new InvalidOperationException("Choose a new REA_UNITY_PLAYER_OUTPUT path.");
        PlayerSettings.companyName = "REA isolated verification";
        PlayerSettings.productName = "REA Transferred Coins";
        PlayerSettings.defaultScreenWidth = 960;
        PlayerSettings.defaultScreenHeight = 540;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes = new [] { "Assets/PendingCoinRecreation/PendingCoins.unity" },
            locationPathName = output, target = BuildTarget.StandaloneOSX, options = BuildOptions.Development
        });
        File.WriteAllText(Path.Combine(Directory.GetParent(Application.dataPath).FullName,"player-build.txt"), report.summary.result.ToString());
        if (report.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Player build failed");
    }
}
