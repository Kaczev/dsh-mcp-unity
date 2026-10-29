using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace DshUnityMcp {
[InitializeOnLoad]
public static class ProjectBridge {
    [Serializable] class Request { public string id; public string action; public long expires; }
    [Serializable] class Reply { public string id; public bool success; public string message; public int pid; }
    static readonly string Root = Path.GetFullPath(Path.Combine(Application.dataPath, "../Library/DshUnityMcp"));
    static double next;
    static double stableSince;
    static ProjectBridge() { EditorApplication.update += Update; }
    static void Update() {
        if (EditorApplication.isCompiling || EditorApplication.isUpdating) { stableSince = 0; return; }
        if (stableSince == 0) stableSince = EditorApplication.timeSinceStartup;
        if (EditorApplication.timeSinceStartup < next) return;
        next = EditorApplication.timeSinceStartup + .25;
        if (!Directory.Exists(Root)) return;
        foreach (var file in Directory.GetFiles(Root, "*.request.json")) {
            Request request = null;
            try {
                request = JsonUtility.FromJson<Request>(File.ReadAllText(file));
                if (request != null && request.action == "ready" && EditorApplication.timeSinceStartup - stableSince < 2) continue;
                File.Delete(file);
                if (request == null || !Guid.TryParseExact(request.id, "N", out _) || Path.GetFileName(file) != request.id + ".request.json") continue;
                if (request.expires < DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) continue;
                if (request.action == "ready") { Write(request.id, true, "Editor update loop ready; MCP connectivity not checked."); continue; }
                bool close = request.action == "close";
                if (request.action == "save" || close) {
                    if (EditorApplication.isPlayingOrWillChangePlaymode) throw new Exception("Stop Play mode before saving or closing.");
                    for (int i = 0; i < EditorSceneManager.sceneCount; i++) {
                        var scene = EditorSceneManager.GetSceneAt(i);
                        if (scene.isLoaded && string.IsNullOrEmpty(scene.path)) throw new Exception("Unnamed scene: save it to an explicit path in the editor first.");
                    }
                    if (PrefabStageUtility.GetCurrentPrefabStage() != null) throw new Exception("Exit Prefab Mode before saving or closing.");
                    if (!EditorSceneManager.SaveOpenScenes()) throw new Exception("Saving scenes failed; editor remains open.");
                    AssetDatabase.SaveAssets();
                    foreach (var asset in Resources.FindObjectsOfTypeAll<UnityEngine.Object>())
                        if (asset != null && EditorUtility.IsPersistent(asset) && EditorUtility.IsDirty(asset) && AssetDatabase.GetAssetPath(asset).StartsWith("Assets/", StringComparison.Ordinal)) throw new Exception("An asset remains dirty: " + AssetDatabase.GetAssetPath(asset) + " (" + asset.name + "); editor remains open.");
                    for (int i = 0; i < EditorSceneManager.sceneCount; i++) if (EditorSceneManager.GetSceneAt(i).isDirty) throw new Exception("A scene remains dirty; editor remains open.");
                } else if (request.action == "enable") {
                    Type server = null;
                    foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies()) { server = assembly.GetType("McpUnity.Unity.McpUnityServer"); if (server != null) break; }
                    if (server == null) throw new Exception("CoderGamester is not compiled yet.");
                    var settings = server.Assembly.GetType("McpUnity.Unity.McpUnitySettings");
                    var settingsInstance = settings.GetProperty("Instance").GetValue(null);
                    settings.GetMethod("LoadSettings").Invoke(settingsInstance, null);
                    var instance = server.GetProperty("Instance").GetValue(null);
                    server.GetMethod("StartServer").Invoke(instance, null);
                } else throw new Exception("Unsupported request.");
                Write(request.id, true, close ? "Saved; normal exit requested." : "Operation completed.");
                if (close) { EditorApplication.delayCall += () => {
                    if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling) return;
                    for (int i = 0; i < EditorSceneManager.sceneCount; i++) if (EditorSceneManager.GetSceneAt(i).isDirty) return;
                    AssetDatabase.SaveAssets();
                    EditorApplication.Exit(0);
                }; return; }
            } catch (Exception error) { if (request != null && Guid.TryParseExact(request.id, "N", out _)) Write(request.id, false, error.Message); }
        }
    }
    static void Write(string id, bool success, string message) {
        var target = Path.Combine(Root, id + ".response.json");
        File.WriteAllText(target + ".tmp", JsonUtility.ToJson(new Reply { id = id, success = success, message = message, pid = System.Diagnostics.Process.GetCurrentProcess().Id }));
        File.Move(target + ".tmp", target);
    }
}
}
