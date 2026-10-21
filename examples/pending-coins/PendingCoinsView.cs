using UnityEngine;

namespace Reconstructed.Gameplay
{
    public sealed class PendingCoinsView : MonoBehaviour
    {
        [SerializeField] private PendingCoinsFeature feature;
        private int lastConsumed;
        public void Bind(PendingCoinsFeature value) { feature = value; }
        public void AddRequested() { feature.Add(5); }
        public void ConsumeRequested() { lastConsumed = feature.Consume(); }
        private void OnGUI()
        {
            if (feature == null) return;
            GUILayout.BeginArea(new Rect(40, 40, 400, 240), GUI.skin.box);
            GUILayout.Label("Pending coins: " + feature.Balance);
            if (GUILayout.Button("Add 5 coins")) AddRequested();
            if (GUILayout.Button("Consume pending coins")) ConsumeRequested();
            GUILayout.Label("Last consumed: " + lastConsumed);
            GUILayout.EndArea();
        }
    }
}
