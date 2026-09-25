#include "game/Buildables.h"
#include "world/Layout.h"
#include "world/Terrain.h"
#include <cmath>

namespace ps {

const BuildInfo& buildInfo(BuildKind k) {
    static const BuildInfo info[] = {
        {"Kennel Block", "Animal housing", 42000, 14, 8, 3.2f, 6, 0, 12, 90, true,
         "Twelve indoor/outdoor dog kennels with drains and heating."},
        {"Dog Run", "Animal housing", 6500, 16, 12, 1.8f, 5, 0, 0, 8, false,
         "Fenced grass run for exercise and meet-and-greets."},
        {"Cat House", "Animal housing", 28000, 10, 7, 3.0f, 6, 0, 16, 60, true,
         "Cat rooms with climbing walls and a viewing window."},
        {"Path", "Landscaping", 180, 2, 4, 0.05f, 0.4f, 0, 0, 0.2f, false, "Concrete walkway segment."},
        {"Tree", "Landscaping", 350, 2, 2, 7.0f, 1.2f, 0, 0, 0.1f, true, "A young oak. Shade and good looks."},
        {"Bench", "Visitor amenities", 450, 1.8f, 0.6f, 0.9f, 1.0f, 2, 0, 0.2f, true, "Somewhere to sit."},
        {"Lamp Post", "Utilities", 1200, 0.4f, 0.4f, 4.5f, 0.6f, 0, 0, 0.6f, true, "Lights paths at night."},
        {"Security Camera", "Security", 1800, 0.4f, 0.4f, 4.0f, 0, 0, 0, 1.0f, true,
         "Pole-mounted camera. View it from the office computer."},
        {"Staff Building", "Facilities", 65000, 12, 9, 3.4f, 3, 0, 0, 80, true,
         "Break room, lockers, laundry. Improves staff morale."},
        {"Parking Lot", "Visitor amenities", 14000, 20, 16, 0.05f, 1.0f, 40, 0, 10, false,
         "Twenty more parking spaces: more visitors per day."},
        {"Small Animal House", "Animal housing", 24000, 10, 7, 3.0f, 5, 0, 30, 50, true,
         "Hutches, cages, tanks and an aviary room for rabbits, rodents, ferrets, birds and reptiles."},
        {"Barn & Paddock", "Animal housing", 58000, 18, 14, 5.0f, 6, 0, 10, 70, true,
         "Stalls and a fenced paddock for horses, donkeys, cattle, camelids, pigs, goats, sheep and poultry."},
        {"Feral Holding", "Animal housing", 36000, 12, 10, 3.2f, 1, 0, 8, 60, true,
         "Reinforced wildlife enclosures with squeeze cages. Needs protective gear for staff."},
        {"Secure Enclosure", "Animal housing", 90000, 10, 10, 4.0f, 0, 0, 2, 120, true,
         "Steel-and-concrete holding for dangerous animals until the authorities or a sanctuary take them."},
        {"Surgery Wing", "Facilities", 120000, 14, 10, 3.6f, 4, 5, 0, 110, true,
         "The upgraded, much bigger medical room: two operating tables, anesthesia machines, recovery ward. "
         "Required for feral and large animals."},
    };
    return info[int(k)];
}

AABB Placed::bounds(float groundY) const {
    const BuildInfo& bi = buildInfo(kind);
    float w = (rot & 1) ? bi.depth : bi.width;
    float d = (rot & 1) ? bi.width : bi.depth;
    return AABB({x - w * 0.5f, groundY, z - d * 0.5f}, {x + w * 0.5f, groundY + bi.height, z + d * 0.5f});
}

std::vector<AABB> reservedAreas() {
    using namespace layout;
    AABB b = buildingBounds();
    b.min.x -= 1.5f; b.min.z -= 1.5f; b.max.x += 1.5f; b.max.z += 1.5f;
    return {
        b,
        AABB({kParkMinX, 0, kParkMinZ}, {kParkMaxX, 5, kParkMaxZ}),
        AABB({-kRoadHalfWidth - 1.5f, 0, kParkMaxZ}, {kRoadHalfWidth + 1.5f, 5, kSouthEdge + 5.0f}),
        AABB({-3.0f, 0, 6.0f}, {3.0f, 5, kParkMinZ}),  // front walkway
    };
}

bool validPlacement(BuildKind kind, float x, float z, int rot, const std::vector<Placed>& existing,
                    std::string* whyNot) {
    auto fail = [&](const char* msg) { if (whyNot) *whyNot = msg; return false; };
    Placed p;
    p.kind = kind; p.x = x; p.z = z; p.rot = rot;
    AABB b = p.bounds(0.0f);
    b.min.y = 0.0f; b.max.y = 5.0f;
    if (!layout::insideRegion(b.min.x, b.min.z, 4.0f) || !layout::insideRegion(b.max.x, b.max.z, 4.0f))
        return fail("Outside the barrier - you can only build inside your 500 sq mi");
    AABB flat = b;
    flat.min.y = -1; flat.max.y = 1;
    for (const AABB& r : reservedAreas()) {
        AABB rr = r; rr.min.y = -1; rr.max.y = 1;
        if (rr.overlaps(flat)) return fail("Blocked by the main building, road or parking");
    }
    for (const Placed& o : existing) {
        AABB ob = o.bounds(0.0f);
        ob.min.y = -1; ob.max.y = 1;
        if (ob.overlaps(flat)) return fail("Overlaps something you already built");
    }
    if (kind != BuildKind::Tree && kind != BuildKind::LampPost && kind != BuildKind::SecurityCamera) {
        float h[5] = {terrain::height(b.min.x, b.min.z), terrain::height(b.max.x, b.min.z),
                      terrain::height(b.min.x, b.max.z), terrain::height(b.max.x, b.max.z), terrain::height(x, z)};
        float lo = h[0], hi = h[0];
        for (float v : h) { lo = std::min(lo, v); hi = std::max(hi, v); }
        if (hi - lo > 2.5f) return fail("Ground is too steep here");
    }
    if (whyNot) whyNot->clear();
    return true;
}

}  // namespace ps
