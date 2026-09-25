// Clinic imaging and the hands-on surgical field, drawn with ImGui.
#pragma once
#include "game/Sim.h"

namespace ps::clinic {

// Draws the exam result (sonogram, X-ray, blood panel or dental chart) for `truth`.
// The player has to read it; nothing on it names the problem.
void drawExamResult(const Exam& e, const Species& sp, float width);

// Interactive surgical field. Returns nothing; calls into Sim for every action.
void drawSurgeryField(Sim& sim, float width, float height, float time);

}  // namespace ps::clinic
