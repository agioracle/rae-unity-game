using UnityEngine;

namespace Reconstructed.Gameplay
{
    /// <summary>Adapted from the four scoped CurrencyManager native procedures.</summary>
    public sealed class PendingCoinsFeature : MonoBehaviour
    {
        [SerializeField] private string preferenceKey = "rea-unity-game.verification.pending-coins";
        public int Balance => Mathf.Max(0, PlayerPrefs.GetInt(preferenceKey, 0));
        public void Set(int value) { PlayerPrefs.SetInt(preferenceKey, Mathf.Max(0, value)); PlayerPrefs.Save(); }
        public void Add(int amount) { if (amount > 0) Set(unchecked(Balance + amount)); }
        public int Consume() { var value = Balance; Set(0); return value; }
        public void UseIsolatedKey(string key) { preferenceKey = key; }
    }
}
