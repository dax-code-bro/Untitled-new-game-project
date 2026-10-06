#include "game/UiFonts.h"
#include <imgui.h>

extern const unsigned char kFontInterRegular[];
extern const unsigned int kFontInterRegularSize;
extern const unsigned char kFontInterSemiBold[];
extern const unsigned int kFontInterSemiBoldSize;

namespace ps {

UiFonts& uiFonts() {
    static UiFonts f;
    return f;
}

void loadUiFonts() {
    ImGuiIO& io = ImGui::GetIO();
    // Latin, Latin-1, general punctuation (dashes, quotes, ellipsis, bullet), euro and trademark signs
    static const ImWchar ranges[] = {0x0020, 0x00FF, 0x2010, 0x205E, 0x20AC, 0x20AC, 0x2122, 0x2122, 0};
    ImFontConfig cfg;
    cfg.FontDataOwnedByAtlas = false;   // the bytes live in the program
    cfg.OversampleH = 3;
    cfg.OversampleV = 2;
    UiFonts& f = uiFonts();
    f.body = io.Fonts->AddFontFromMemoryTTF((void*)kFontInterRegular, int(kFontInterRegularSize), 16.0f, &cfg, ranges);
    f.bold = io.Fonts->AddFontFromMemoryTTF((void*)kFontInterSemiBold, int(kFontInterSemiBoldSize), 16.0f, &cfg, ranges);
    ImFontConfig big = cfg;
    big.OversampleH = 2;
    f.large = io.Fonts->AddFontFromMemoryTTF((void*)kFontInterSemiBold, int(kFontInterSemiBoldSize), 44.0f, &big, ranges);
    if (f.body) io.FontDefault = f.body;
}

ImFont* labelFont() {
    return uiFonts().large ? uiFonts().large : ImGui::GetFont();
}

}  // namespace ps
