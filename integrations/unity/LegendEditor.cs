using UnityEditor;
using UnityEngine;
using Legend;

[CustomEditor(typeof(LegendAI))]
public class LegendEditor : Editor
{
    private string _chatInput = "";
    private string _lastResponse = "";
    private string _modelPrompt = "";
    private string _texturePrompt = "";

    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        EditorGUILayout.Space(10);

        var legend = (LegendAI)target;

        EditorGUILayout.LabelField("Legend AI Studio", EditorStyles.boldLabel);
        EditorGUILayout.Space(4);

        // Chat
        EditorGUILayout.LabelField("Chat with Legend");
        _chatInput = EditorGUILayout.TextField(_chatInput);
        if (GUILayout.Button("Send") && !string.IsNullOrEmpty(_chatInput))
        {
            legend.OnResponse += r => { _lastResponse = r; Repaint(); };
            legend.Chat(_chatInput);
            _chatInput = "";
        }
        if (!string.IsNullOrEmpty(_lastResponse))
        {
            EditorGUILayout.HelpBox(_lastResponse, MessageType.None);
        }

        EditorGUILayout.Space(8);

        // Model generation
        EditorGUILayout.LabelField("Generate 3D Model");
        _modelPrompt = EditorGUILayout.TextField(_modelPrompt);
        if (GUILayout.Button("Generate Model") && !string.IsNullOrEmpty(_modelPrompt))
            legend.GenerateModel(_modelPrompt);

        EditorGUILayout.Space(4);

        // Texture generation
        EditorGUILayout.LabelField("Generate Texture");
        _texturePrompt = EditorGUILayout.TextField(_texturePrompt);
        if (GUILayout.Button("Generate Texture") && !string.IsNullOrEmpty(_texturePrompt))
            legend.GenerateTexture(_texturePrompt);
    }
}
