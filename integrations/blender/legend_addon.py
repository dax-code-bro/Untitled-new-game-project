"""
Legend Blender Addon
Connects Blender to the Legend AI system.
Install: Edit > Preferences > Add-ons > Install > select this file
"""

bl_info = {
    "name": "Legend AI",
    "author": "Legend",
    "version": (0, 1, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Legend",
    "description": "Legend AI integration for 3D model generation and scene building",
    "category": "3D View",
}

import bpy
import json
import threading
import urllib.request
import urllib.parse


LEGEND_API = "http://localhost:8000"


class LegendPanel(bpy.types.Panel):
    bl_label = "Legend AI"
    bl_idname = "VIEW3D_PT_legend"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Legend"

    def draw(self, context):
        layout = self.layout
        scene = context.scene

        layout.label(text="Legend AI Studio", icon="FUND")
        layout.separator()

        box = layout.box()
        box.label(text="Generate 3D Model")
        box.prop(scene, "legend_model_prompt", text="")
        box.operator("legend.generate_model", text="Generate", icon="MESH_MONKEY")

        box = layout.box()
        box.label(text="Generate Texture")
        box.prop(scene, "legend_texture_prompt", text="")
        box.prop(scene, "legend_texture_resolution", text="Resolution")
        box.operator("legend.generate_texture", text="Generate Texture", icon="TEXTURE")

        box = layout.box()
        box.label(text="Build Scene from Story")
        box.prop(scene, "legend_scene_description", text="")
        box.operator("legend.build_scene", text="Build Scene", icon="SCENE_DATA")

        box = layout.box()
        box.label(text="Ask Legend")
        box.prop(scene, "legend_question", text="")
        box.operator("legend.ask", text="Ask", icon="QUESTION")

        if scene.legend_response:
            box = layout.box()
            box.label(text="Response:")
            for line in scene.legend_response.split("\n")[:10]:
                box.label(text=line[:60])


class LEGEND_OT_GenerateModel(bpy.types.Operator):
    bl_idname = "legend.generate_model"
    bl_label = "Generate 3D Model"
    bl_description = "Use Legend AI to generate a 3D model from text"

    def execute(self, context):
        prompt = context.scene.legend_model_prompt
        if not prompt:
            self.report({"ERROR"}, "Enter a model description first")
            return {"CANCELLED"}

        thread = threading.Thread(target=self._generate, args=(prompt,))
        thread.daemon = True
        thread.start()
        self.report({"INFO"}, f"Generating: {prompt}")
        return {"FINISHED"}

    def _generate(self, prompt: str):
        try:
            data = json.dumps({"description": prompt}).encode()
            req = urllib.request.Request(
                f"{LEGEND_API}/creative/model",
                data=data,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read())
                model_path = result.get("path")
                if model_path:
                    bpy.ops.import_scene.gltf(filepath=model_path)
        except Exception as e:
            print(f"Legend model generation failed: {e}")


class LEGEND_OT_GenerateTexture(bpy.types.Operator):
    bl_idname = "legend.generate_texture"
    bl_label = "Generate Texture"
    bl_description = "Use Legend AI to generate a texture"

    def execute(self, context):
        prompt = context.scene.legend_texture_prompt
        resolution = context.scene.legend_texture_resolution
        if not prompt:
            self.report({"ERROR"}, "Enter a texture description first")
            return {"CANCELLED"}

        thread = threading.Thread(target=self._generate, args=(prompt, resolution))
        thread.daemon = True
        thread.start()
        self.report({"INFO"}, "Generating texture...")
        return {"FINISHED"}

    def _generate(self, prompt: str, resolution: int):
        try:
            data = json.dumps({"description": prompt, "resolution": resolution}).encode()
            req = urllib.request.Request(
                f"{LEGEND_API}/creative/texture",
                data=data,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read())
                texture_path = result.get("path")
                if texture_path:
                    img = bpy.data.images.load(texture_path)
                    print(f"Legend: Texture loaded — {img.name}")
        except Exception as e:
            print(f"Legend texture generation failed: {e}")


class LEGEND_OT_BuildScene(bpy.types.Operator):
    bl_idname = "legend.build_scene"
    bl_label = "Build Scene"
    bl_description = "Use Legend AI to build a full 3D scene from a description"

    def execute(self, context):
        description = context.scene.legend_scene_description
        if not description:
            self.report({"ERROR"}, "Enter a scene description first")
            return {"CANCELLED"}
        self.report({"INFO"}, "Building scene... (check console)")
        return {"FINISHED"}


class LEGEND_OT_Ask(bpy.types.Operator):
    bl_idname = "legend.ask"
    bl_label = "Ask Legend"
    bl_description = "Ask Legend a question about your 3D project"

    def execute(self, context):
        question = context.scene.legend_question
        if not question:
            self.report({"ERROR"}, "Enter a question first")
            return {"CANCELLED"}

        thread = threading.Thread(target=self._ask, args=(context.scene, question))
        thread.daemon = True
        thread.start()
        return {"FINISHED"}

    def _ask(self, scene, question: str):
        try:
            data = json.dumps({"message": question, "mode": "conversation"}).encode()
            req = urllib.request.Request(
                f"{LEGEND_API}/chat",
                data=data,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read())
                scene.legend_response = result.get("response", "No response")
        except Exception as e:
            scene.legend_response = f"Error: {e}"


CLASSES = [
    LegendPanel,
    LEGEND_OT_GenerateModel,
    LEGEND_OT_GenerateTexture,
    LEGEND_OT_BuildScene,
    LEGEND_OT_Ask,
]


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)

    bpy.types.Scene.legend_model_prompt = bpy.props.StringProperty(
        name="Model Prompt", default="", description="Describe the 3D model to generate"
    )
    bpy.types.Scene.legend_texture_prompt = bpy.props.StringProperty(
        name="Texture Prompt", default="", description="Describe the texture"
    )
    bpy.types.Scene.legend_texture_resolution = bpy.props.IntProperty(
        name="Resolution", default=2048, min=512, max=4096, step=512
    )
    bpy.types.Scene.legend_scene_description = bpy.props.StringProperty(
        name="Scene Description", default=""
    )
    bpy.types.Scene.legend_question = bpy.props.StringProperty(
        name="Question", default=""
    )
    bpy.types.Scene.legend_response = bpy.props.StringProperty(
        name="Response", default=""
    )


def unregister():
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

    del bpy.types.Scene.legend_model_prompt
    del bpy.types.Scene.legend_texture_prompt
    del bpy.types.Scene.legend_texture_resolution
    del bpy.types.Scene.legend_scene_description
    del bpy.types.Scene.legend_question
    del bpy.types.Scene.legend_response


if __name__ == "__main__":
    register()
