using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Legend
{
    /// <summary>
    /// Legend AI integration for Unity.
    /// Attach to any GameObject to access Legend from your scenes.
    /// </summary>
    public class LegendAI : MonoBehaviour
    {
        [Header("Connection")]
        public string apiUrl = "http://localhost:8000";

        [Header("Generation")]
        public string modelPrompt = "";
        public string texturePrompt = "";
        public string storyPrompt = "";

        public event Action<string> OnResponse;
        public event Action<string> OnModelGenerated;
        public event Action<Texture2D> OnTextureGenerated;
        public event Action<string> OnError;

        private static LegendAI _instance;
        public static LegendAI Instance => _instance;

        void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }
            _instance = this;
            DontDestroyOnLoad(gameObject);
        }

        /// <summary>Send a message to Legend and get a response.</summary>
        public void Chat(string message, string mode = "conversation")
        {
            StartCoroutine(PostRequest("/chat", new ChatRequest { message = message, mode = mode },
                json =>
                {
                    var resp = JsonUtility.FromJson<ChatResponse>(json);
                    OnResponse?.Invoke(resp.response);
                }));
        }

        /// <summary>Generate a 3D model from a text description.</summary>
        public void GenerateModel(string description)
        {
            StartCoroutine(PostRequest("/creative/model", new ModelRequest { description = description },
                json =>
                {
                    var resp = JsonUtility.FromJson<AssetResponse>(json);
                    OnModelGenerated?.Invoke(resp.path);
                }));
        }

        /// <summary>Generate a texture and apply it to the target renderer.</summary>
        public void GenerateTexture(string description, Renderer target = null)
        {
            StartCoroutine(PostRequest("/creative/texture", new TextureRequest { description = description, resolution = 2048 },
                json =>
                {
                    var resp = JsonUtility.FromJson<AssetResponse>(json);
                    StartCoroutine(LoadTexture(resp.path, target));
                }));
        }

        /// <summary>Write a story and return it as a string.</summary>
        public void WriteStory(string premise, string genre = "general", string format = "prose")
        {
            StartCoroutine(PostRequest("/story/write", new StoryRequest { premise = premise, genre = genre, format = format },
                json =>
                {
                    var resp = JsonUtility.FromJson<StoryResponse>(json);
                    OnResponse?.Invoke(resp.story);
                }));
        }

        private IEnumerator PostRequest(string endpoint, object body, Action<string> onSuccess)
        {
            string json = JsonUtility.ToJson(body);
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            using var req = new UnityWebRequest(apiUrl + endpoint, "POST");
            req.uploadHandler = new UploadHandlerRaw(bytes);
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");

            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
                onSuccess?.Invoke(req.downloadHandler.text);
            else
                OnError?.Invoke($"Legend API error [{endpoint}]: {req.error}");
        }

        private IEnumerator LoadTexture(string path, Renderer target)
        {
            using var req = UnityWebRequestTexture.GetTexture("file://" + path);
            yield return req.SendWebRequest();

            if (req.result == UnityWebRequest.Result.Success)
            {
                var tex = DownloadHandlerTexture.GetContent(req);
                OnTextureGenerated?.Invoke(tex);
                if (target != null)
                    target.material.mainTexture = tex;
            }
        }

        [Serializable] class ChatRequest { public string message; public string mode; }
        [Serializable] class ChatResponse { public string response; }
        [Serializable] class ModelRequest { public string description; }
        [Serializable] class TextureRequest { public string description; public int resolution; }
        [Serializable] class StoryRequest { public string premise; public string genre; public string format; }
        [Serializable] class StoryResponse { public string story; }
        [Serializable] class AssetResponse { public string path; }
    }
}
