// The interface typeface (Inter), compiled into the game. body is the default UI font;
// large is a big, crisp cut for titles and text drawn over the 3D world (signs, name tags).
#pragma once

struct ImFont;

namespace ps {

struct UiFonts {
    ImFont* body = nullptr;    // 16 px, regular
    ImFont* bold = nullptr;    // 16 px, semibold (headings)
    ImFont* large = nullptr;   // 44 px, semibold (titles, world labels: drawn smaller, stays sharp)
};

UiFonts& uiFonts();
void loadUiFonts();                 // call once after ImGui::CreateContext()
ImFont* labelFont();                // the font for text drawn into the world (large if loaded)

}  // namespace ps
